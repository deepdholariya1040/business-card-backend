import mongoose from "mongoose";

import User from "./user.model.js";
import Company from "../companies/company.model.js";
import logger from "../../config/logger.js";
import {
  sendUserWelcomeEmail,
  sendUserRoleUpdateEmail,
} from "../../services/email.service.js";

/**
 * Runs `work(session)` inside a MongoDB transaction when the underlying
 * deployment supports one (replica set / mongos).
 *
 * Standalone MongoDB instances (common in dev/self-hosted setups, and
 * the default in this project's docker-compose.yml) do not support
 * multi-document transactions. Rather than failing every request on
 * those deployments, we transparently fall back to running the same
 * work without a session.
 */
export const runWithOptionalTransaction = async (work) => {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });

    return result;
  } catch (error) {
    const unsupported =
      error?.code === 20 ||
      error?.codeName === "IllegalOperation" ||
      /Transaction numbers are only allowed|Transactions are not supported|replica set/i.test(
        error?.message || ""
      );

    if (!unsupported) {
      throw error;
    }

    logger.warn(
      "MongoDB transactions are not supported on this deployment (standalone instance) - falling back to a non-transactional write."
    );

    return work(null);
  } finally {
    session.endSession();
  }
};

const withSession = (query, session) =>
  session ? query.session(session) : query;

/**
 * Core "assign or create" resolver used by every user/company assignment
 * flow: Main Company Admin, Company Admin, Staff, and any future role
 * assignment.
 *
 * Rule 1 - user already exists (matched by email):
 *   Never create a duplicate. Update only the fields that actually need
 *   to change (role / company / tenant / canManageStaff). The user's
 *   _id, name, password, OAuth info (googleId/provider), refreshToken,
 *   and audit history are left completely untouched.
 *
 * Rule 2 - user does not exist:
 *   Create a new user with the project's existing default fields
 *   (matches the conventions already used by addCompanyAdmin/addStaff:
 *   provider "GOOGLE", isVerified true, name derived from the email).
 *
 * Returns { user, isNewUser, roleChanged, companyChanged } so callers
 * can decide on audit-log actions / response messaging / notifications
 * without re-deriving that state.
 */
export const assignOrCreateUser = async (
  {
    email,
    role,
    companyId = null,
    tenantId = null,
    canManageStaff = false,
    createdBy = null,
  },
  { session = null } = {}
) => {
  if (!email) {
    throw new Error("assignOrCreateUser: email is required.");
  }

  if (!role) {
    throw new Error("assignOrCreateUser: role is required.");
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const resolvedTenantId = tenantId !== undefined ? tenantId : companyId;

  const existingUser = await withSession(
    User.findOne({ email: normalizedEmail }),
    session
  );

  if (existingUser) {
    const targetCompanyId = companyId ? String(companyId) : null;
    const currentCompanyId = existingUser.companyId
      ? String(existingUser.companyId)
      : null;

    const roleChanged = existingUser.role !== role;
    const companyChanged = currentCompanyId !== targetCompanyId;
    const staffFlagChanged =
      existingUser.canManageStaff !== Boolean(canManageStaff);

    if (!roleChanged && !companyChanged && !staffFlagChanged) {
      // Already assigned exactly as requested - nothing to update, no
      // email to send, no duplicate created.
      return {
        user: existingUser,
        isNewUser: false,
        roleChanged: false,
        companyChanged: false,
      };
    }

    // Only touch fields that actually need to change. Everything else
    // (name, email, password, googleId, provider, refreshToken,
    // lastLoginAt/Ip/Device, createdAt, etc.) is preserved as-is.
    if (roleChanged) {
      existingUser.role = role;
    }

    if (companyChanged) {
      existingUser.companyId = companyId;
      existingUser.tenantId = resolvedTenantId;
    }

    if (staffFlagChanged) {
      existingUser.canManageStaff = Boolean(canManageStaff);
    }

    await existingUser.save(session ? { session } : undefined);

    return {
      user: existingUser,
      isNewUser: false,
      roleChanged,
      companyChanged,
    };
  }

  // No user found for this email - create a new one, following the
  // same default-field conventions already used elsewhere in the
  // project for role assignment (see previous addCompanyAdmin/addStaff
  // implementations).
  const derivedName = normalizedEmail.split("@")[0];
  const createOptions = session ? { session } : undefined;

  const [newUser] = await User.create(
    [
      {
        name: derivedName,
        email: normalizedEmail,
        role,
        companyId,
        tenantId: resolvedTenantId,
        canManageStaff: Boolean(canManageStaff),
        createdBy,
        provider: "GOOGLE",
        googleId: null,
        avatar: null,
        isVerified: true,
      },
    ],
    createOptions
  );

  return {
    user: newUser,
    isNewUser: true,
    roleChanged: true,
    companyChanged: true,
  };
};

/**
 * Fire-and-forget email notification for an assignOrCreateUser result.
 * Must never throw - a failed/unconfigured mail provider must never
 * break the underlying user/company assignment (mirrors how the rest
 * of the app already treats email.service.js as best-effort).
 */
export const notifyAssignmentResult = async (
  { user, isNewUser, roleChanged, companyChanged },
  { companyId = null } = {}
) => {
  try {
    let companyName = null;

    if (companyId) {
      const company = await Company.findById(companyId).select("name");
      companyName = company?.name || null;
    }

    if (isNewUser) {
      await sendUserWelcomeEmail(user.email, {
        role: user.role,
        companyName,
      });
      return;
    }

    if (roleChanged || companyChanged) {
      await sendUserRoleUpdateEmail(user.email, {
        role: user.role,
        companyName,
      });
    }
  } catch (error) {
    logger.error(
      { err: error },
      `Failed to send assignment notification email to ${user?.email}`
    );
  }
};
