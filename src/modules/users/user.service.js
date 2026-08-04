import User from "./user.model.js";
import Company from "../companies/company.model.js";
import BusinessCard from "../business-cards/businessCard.model.js";

import { ROLES } from "../../config/roles.js";
import ApiError from "../../utils/ApiError.js";

import {
  assignOrCreateUser,
  notifyAssignmentResult,
} from "./userAssignment.service.js";

// NORMAL USERS ONLY
export const getUsers = async () => {
  return User.find({
    role: ROLES.NORMAL_USER
  })
    .select("-refreshToken")
    .sort({ createdAt: -1 });
};

// SUPER ADMINS ONLY
export const getSuperAdmins = async () => {
  return User.find({
    role: ROLES.SUPER_ADMIN,
  })
    .select("-refreshToken")
    .sort({ createdAt: -1 });
};

// COMPANY USERS ONLY
export const getCompanyUsers = async (filter = {}) => {
  const query = {
    ...filter,
  };

  // Jab role filter na ho tabhi sab roles lao
  if (!filter.role) {
    query.role = {
      $in: [
        ROLES.MAIN_COMPANY_ADMIN,
        ROLES.COMPANY_ADMIN,
        ROLES.STAFF,
      ],
    };
  }

  return User.find(query)
    .select("-refreshToken")
    .sort({ createdAt: -1 });
};
export const getUserById = async (
  id
) => {

  const user =
    await User.findById(id)
      .select("-refreshToken");

  if (!user) {
    throw new ApiError(
      404,
      "User not found."
    );
  }

  const now = new Date();

  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const startOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  const startOfYear = new Date(
    now.getFullYear(),
    0,
    1
  );

  const [
    totalCards,
    todayScans,
    monthlyScans,
    yearlyScans
  ] = await Promise.all([

    BusinessCard.countDocuments({
      createdBy: user._id
    }),

    BusinessCard.countDocuments({
      createdBy: user._id,
      createdAt: {
        $gte: startOfDay
      }
    }),

    BusinessCard.countDocuments({
      createdBy: user._id,
      createdAt: {
        $gte: startOfMonth
      }
    }),

    BusinessCard.countDocuments({
      createdBy: user._id,
      createdAt: {
        $gte: startOfYear
      }
    })

  ]);

  return {
    ...user.toObject(),

    totalCards,
    todayScans,
    monthlyScans,
    yearlyScans
  };

};

// Assign-or-create flow: the frontend sends only { email, role,
// companyId?, canManageStaff? } - no `name` is required or accepted
// anymore. If a user with this email already exists, their role /
// company assignment is updated in place (same _id, password, OAuth
// info, refresh tokens, and audit history preserved). Otherwise a new
// user is created. This same helper (assignOrCreateUser) is reused by
// every other assignment entry point (company creation's main admin,
// addCompanyAdmin, addStaff, changeMainAdmin) so the behavior is
// identical everywhere.
export const createUser = async (
  currentUser,
  payload
) => {

  const {
    email,
    role,
    companyId = null,
    canManageStaff = false
  } = payload;

  if (!email) {
    throw new ApiError(
      400,
      "Email is required."
    );
  }

  const normalizedEmail =
    String(email).trim().toLowerCase();

  switch (
    currentUser.role
  ) {

    case ROLES.SUPER_ADMIN:

      if (
        role !==
        ROLES.MAIN_COMPANY_ADMIN
      ) {
        throw new ApiError(
          403,
          "Super Admin can only create Main Company Admins."
        );
      }

      break;



    case ROLES.MAIN_COMPANY_ADMIN:

      if (
        role !==
        ROLES.COMPANY_ADMIN
      ) {
        throw new ApiError(
          403,
          "Main Company Admin can only create Company Admins."
        );
      }

      break;



    case ROLES.COMPANY_ADMIN:

      if (
        role !==
        ROLES.STAFF
      ) {
        throw new ApiError(
          403,
          "Company Admin can only create Staff."
        );
      }

      if (
        !currentUser.canManageStaff
      ) {
        throw new ApiError(
          403,
          "You do not have permission to manage staff."
        );
      }

      break;



    default:

      throw new ApiError(
        403,
        "You do not have permission to create users."
      );

  }

  let company = null;

  if (companyId) {

    company =
      await Company.findById(
        companyId
      );

    if (!company) {
      throw new ApiError(
        404,
        "Company not found."
      );
    }

    // Plan limits (maxCompanyAdmins / maxStaff) should only block
    // requests that actually add a *new* member to that role in this
    // company - not a no-op re-assignment of a user who already holds
    // that exact role/company.
    const existingUserForLimitCheck =
      await User.findOne({
        email: normalizedEmail
      });

    const alreadyHoldsRoleHere =
      !!existingUserForLimitCheck &&
      existingUserForLimitCheck.role === role &&
      !!existingUserForLimitCheck.companyId &&
      String(existingUserForLimitCheck.companyId) ===
        String(companyId);

    if (!alreadyHoldsRoleHere) {

      if (
        role ===
        ROLES.COMPANY_ADMIN
      ) {

        const adminCount =
          await User.countDocuments(
            {
              companyId,
              role:
                ROLES.COMPANY_ADMIN
            }
          );

        if (
          adminCount >=
          company.maxCompanyAdmins
        ) {
          throw new ApiError(
            400,
            "Company Admin limit reached."
          );
        }
      }

      if (
        role ===
        ROLES.STAFF
      ) {

        const staffCount =
          await User.countDocuments(
            {
              companyId,
              role:
                ROLES.STAFF
            }
          );

        if (
          staffCount >=
          company.maxStaff
        ) {
          throw new ApiError(
            400,
            "Staff limit reached."
          );
        }
      }
    }
  }

  const result =
    await assignOrCreateUser({
      email: normalizedEmail,
      role,
      companyId,
      tenantId: companyId,
      canManageStaff,
      createdBy:
        currentUser._id
    });

  // Best-effort notification email - never blocks/breaks the
  // assignment itself if the mail provider is unavailable.
  notifyAssignmentResult(
    result,
    { companyId }
  ).catch(() => {});

  return result;

};

export const updateUser = async (
  id,
  payload
) => {

  // Protected fields
  delete payload.email;
  delete payload.role;
  delete payload.googleId;
  delete payload.companyId;
  delete payload.tenantId;
  delete payload.createdBy;
  delete payload.previousRole;

  return User.findByIdAndUpdate(
    id,
    payload,
    {
      new: true,
      runValidators: true
    }
  ).select(
    "-refreshToken"
  );

};

export const deleteUser = async (
  id
) => {

  return User.findByIdAndDelete(
    id
  );

};

// GET ALL CARDS OF A USER
export const getUserCards =
  async (userId) => {

    return BusinessCard.find({
      createdBy: userId
    }).sort({
      createdAt: -1
    });

};