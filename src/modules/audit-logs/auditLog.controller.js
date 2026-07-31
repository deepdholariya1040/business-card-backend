import { StatusCodes } from "http-status-codes";

import ApiResponse from "../../utils/ApiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";

import { getAuditLogs } from "./audit.service.js";

export const getAllAuditLogs =
  asyncHandler(async (req, res) => {
    const logs =
      await getAuditLogs(
        req.user
      );

    res.status(
      StatusCodes.OK
    ).json(
      new ApiResponse(
        StatusCodes.OK,
        "Audit logs fetched successfully.",
        logs
      )
    );
  });