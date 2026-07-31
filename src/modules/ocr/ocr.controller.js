import { StatusCodes } from "http-status-codes";

import ApiResponse from "../../utils/ApiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";

import { processOCR } from "./ocr.service.js";

export const scanCard = asyncHandler(async (req, res) => {
  const frontImagePath =
    req.files?.frontImage?.[0]?.path || null;
  const backImagePath =
    req.files?.backImage?.[0]?.path || null;

  if (!frontImagePath && !backImagePath) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: "At least one image (front or back) is required."
    });
  }

  const result = await processOCR(
    req.user,
    frontImagePath,
    backImagePath
  );

  res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      "OCR completed successfully.",
      result
    )
  );
});