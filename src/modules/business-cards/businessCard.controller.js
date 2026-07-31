import { StatusCodes } from "http-status-codes";

import User from "../users/user.model.js";

import ApiError from "../../utils/ApiError.js";
import ApiResponse from "../../utils/ApiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";

import {
  getBusinessCards,
  getBusinessCardById,
  updateBusinessCard,
  deleteBusinessCard,
  sanitizeBusinessCard,
} from "./businessCard.service.js";

const canAccessCard = async (user, card) => {
  const createdById = String(card.createdBy?._id || card.createdBy);

  switch (user.role) {
    case "SUPER_ADMIN":
      return true;

    case "MAIN_COMPANY_ADMIN":
      return String(card.companyId) === String(user.companyId);

    case "COMPANY_ADMIN": {
      if (createdById === String(user.id)) {
        return true;
      }

      const staff = await User.findOne({
        _id: createdById,
        role: "STAFF",
        companyId: user.companyId,
      });

      return !!staff;
    }

    case "STAFF":
    case "NORMAL_USER":
      return createdById === String(user.id);

    default:
      return false;
  }
};

export const getAllBusinessCards = asyncHandler(async (req, res) => {
  const { search, companyId, role, createdBy } = req.query;

  let filter = {};

  switch (req.user.role) {
    // ==========================
    // SUPER ADMIN
    // ==========================
    case "SUPER_ADMIN": {
      filter.createdBy = req.user.id;

      if (companyId || role || createdBy) {
        delete filter.createdBy;
      }

      if (companyId) {
        filter.companyId = companyId;
      }

      if (createdBy && createdBy !== "all") {
        filter.createdBy = createdBy;
      }

      break;
    }

    // ==========================
    // MAIN COMPANY ADMIN
    // ==========================
    case "MAIN_COMPANY_ADMIN": {
      const members = await User.find({
        companyId: req.user.companyId,
      }).select("_id");

      const memberIds = members.map((m) => m._id);

      filter.companyId = req.user.companyId;

      // Default -> own cards only
      if (!createdBy) {
        filter.createdBy = req.user.id;
      }
      // All Members selected
      else if (createdBy === "all") {
        filter.createdBy = {
          $in: memberIds,
        };
      }
      // Particular member selected
      else {
        const member = await User.findOne({
          _id: createdBy,
          companyId: req.user.companyId,
        });

        if (!member) {
          throw new ApiError(
            StatusCodes.FORBIDDEN,
            "Invalid member selected."
          );
        }

        filter.createdBy = createdBy;
      }

      break;
    }

    // ==========================
    // COMPANY ADMIN
    // ==========================
    case "COMPANY_ADMIN": {
      const members = await User.find({
        companyId: req.user.companyId,
        $or: [{ role: "STAFF" }, { _id: req.user.id }],
      }).select("_id");

      const memberIds = members.map((m) => m._id);

      filter.companyId = req.user.companyId;

      // Default -> own cards only
      if (!createdBy) {
        filter.createdBy = req.user.id;
      }
      // All Members selected
      else if (createdBy === "all") {
        filter.createdBy = {
          $in: memberIds,
        };
      }
      // Particular member selected
      else {
        const staff = await User.findOne({
          _id: createdBy,
          companyId: req.user.companyId,
          $or: [{ role: "STAFF" }, { _id: req.user.id }],
        });

        if (!staff) {
          throw new ApiError(
            StatusCodes.FORBIDDEN,
            "Invalid member selected."
          );
        }

        filter.createdBy = createdBy;
      }

      break;
    }

    // ==========================
    // STAFF / NORMAL USER
    // ==========================
    case "STAFF":
    case "NORMAL_USER":
    default: {
      filter.createdBy = req.user.id;
      break;
    }
  }

  // ==========================
  // Search
  // ==========================
  if (search) {
    filter.$and = [
      {
        $or: [
          {
            "parsedData.name": {
              $regex: search,
              $options: "i",
            },
          },
          {
            "parsedData.designation": {
              $regex: search,
              $options: "i",
            },
          },
          {
            "parsedData.company": {
              $regex: search,
              $options: "i",
            },
          },
          {
            "parsedData.email": {
              $regex: search,
              $options: "i",
            },
          },
          {
            "parsedData.website": {
              $regex: search,
              $options: "i",
            },
          },
          {
            "parsedData.address": {
              $regex: search,
              $options: "i",
            },
          },
          {
            "parsedData.phones": {
              $regex: search,
              $options: "i",
            },
          },
        ],
      },
    ];
  }

  // ==========================
  // Role Filter
  // ==========================
  if (role && (!createdBy || createdBy === "all")) {
    const users = await User.find({
      role,
      ...(req.user.role === "SUPER_ADMIN"
        ? companyId
          ? { companyId }
          : {}
        : { companyId: req.user.companyId }),
    }).select("_id");

    const userIds = users.map((u) => u._id);

    filter.createdBy = {
      $in: userIds,
    };
  }

  // Fetch raw cards
  const cards = await getBusinessCards(filter);

  // Sanitize before sending to frontend
  const response = cards.map(sanitizeBusinessCard);

  res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      "Business cards fetched successfully.",
      response
    )
  );
});

export const getSingleBusinessCard = asyncHandler(async (req, res) => {
  const card = await getBusinessCardById(req.params.id);

  if (!card) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Business card not found."
    );
  }

  if (!(await canAccessCard(req.user, card))) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Access denied."
    );
  }

  const response = sanitizeBusinessCard(card);

  res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      "Business card fetched successfully.",
      response
    )
  );
});

export const updateExistingBusinessCard = asyncHandler(async (req, res) => {
  const card = await getBusinessCardById(req.params.id);

  if (!card) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Business card not found."
    );
  }

  if (!(await canAccessCard(req.user, card))) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Access denied."
    );
  }

  const updatedCard = await updateBusinessCard(
    req.params.id,
    req.body
  );

  const response = sanitizeBusinessCard(updatedCard);

  res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      "Business card updated successfully.",
      response
    )
  );
});

export const removeBusinessCard = asyncHandler(async (req, res) => {
  const card = await getBusinessCardById(req.params.id);

  if (!card) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Business card not found."
    );
  }

  if (!(await canAccessCard(req.user, card))) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Access denied."
    );
  }

  await deleteBusinessCard(req.params.id);

  res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      "Business card deleted successfully."
    )
  );
});