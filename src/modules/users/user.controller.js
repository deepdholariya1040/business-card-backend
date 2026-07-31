import { StatusCodes } from "http-status-codes";

import ApiError from "../../utils/ApiError.js";
import ApiResponse from "../../utils/ApiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";

import {
  getUsers,
  getCompanyUsers,
  getUserById,
  getUserCards,
  createUser,
  updateUser,
  deleteUser,
} from "./user.service.js";

import { createAuditLog } from "../audit-logs/audit.service.js";

import { ROLES } from "../../config/roles.js";


export const getAllUsers = asyncHandler(async (req, res) => {
  if (req.user.role !== "SUPER_ADMIN") {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Only Super Admin can access users.",
    );
  }

  const users = await getUsers();

  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, "Users fetched successfully.", users),
    );
});

export const getSingleUser = asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, "User not found.");
  }

  if (
    req.user.role !== "SUPER_ADMIN" &&
    String(user.companyId) !== String(req.user.companyId) &&
    String(user._id) !== String(req.user.id)
  ) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Access denied.");
  }

  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, "User fetched successfully.", user));
});

export const createNewUser = asyncHandler(async (req, res) => {
  const user = await createUser(req.user, req.body);

  await createAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "CREATE_USER",
    targetId: user._id,
    tenantId: req.user.tenantId,
    companyId: req.user.companyId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  res
    .status(StatusCodes.CREATED)
    .json(
      new ApiResponse(StatusCodes.CREATED, "User created successfully.", user),
    );
});

export const updateExistingUser = asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, "User not found.");
  }

  if (
    req.user.role !== "SUPER_ADMIN" &&
    String(user.companyId) !== String(req.user.companyId) &&
    String(user._id) !== String(req.user.id)
  ) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Access denied.");
  }

  const updatedUser = await updateUser(req.params.id, req.body);

  await createAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "UPDATE_USER",
    targetId: updatedUser._id,
    tenantId: req.user.tenantId,
    companyId: req.user.companyId,
  });

  res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        "User updated successfully.",
        updatedUser,
      ),
    );
});

export const removeUser = asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, "User not found.");
  }

  if (
    req.user.role !== "SUPER_ADMIN" &&
    String(user.companyId) !== String(req.user.companyId)
  ) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Access denied.");
  }

  await deleteUser(req.params.id);

  await createAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: "DELETE_USER",
    targetId: req.params.id,
    tenantId: req.user.tenantId,
    companyId: req.user.companyId,
  });

  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, "User deleted successfully."));
});

export const getUserCardsController = asyncHandler(async (req, res) => {
  const targetUser = await getUserById(req.params.id);

  if (!targetUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, "User not found.");
  }

  // Same access rule as viewing the user profile itself: Super Admin,
  // same company, or the user viewing their own cards.
  if (
    req.user.role !== "SUPER_ADMIN" &&
    String(targetUser.companyId) !== String(req.user.companyId) &&
    String(targetUser._id) !== String(req.user.id)
  ) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Access denied.");
  }

  const cards = await getUserCards(req.params.id);

  res
    .status(200)
    .json(new ApiResponse(200, "User cards fetched successfully.", cards));
});

export const getAllCompanyUsers = asyncHandler(async (req, res) => {
  const { companyId, role } = req.query;

  const filter = {};

  switch (req.user.role) {
    case ROLES.SUPER_ADMIN:
      if (companyId) {
        filter.companyId = companyId;
      }

      if (role) {
        filter.role = role;
      }
      break;

    case ROLES.MAIN_COMPANY_ADMIN:
      filter.companyId = req.user.companyId;

      if (role) {
        filter.role = role;
      }
      break;

    case ROLES.COMPANY_ADMIN:
      filter.companyId = req.user.companyId;

      // Company Admin can only access staff users
      filter.role = ROLES.STAFF;
      break;

    default:
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "Access denied."
      );
  }

  const users = await getCompanyUsers(filter);

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      "Company users fetched successfully.",
      users
    )
  );
});