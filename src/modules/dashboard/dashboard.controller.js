import { StatusCodes } from "http-status-codes";

import ApiResponse from "../../utils/ApiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";

import { getDashboardStats } from "./dashboard.service.js";

export const getDashboard = asyncHandler(async (req, res) => {
  const stats = await getDashboardStats(req.user);

  res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      "Dashboard fetched successfully.",
      stats
    )
  );
});