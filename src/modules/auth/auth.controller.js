import { StatusCodes } from "http-status-codes";

import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import ApiError from "../../utils/ApiError.js";
import { env } from "../../config/env.js";

import {
  loginWithGoogle,
  issueSession,
  getCurrentUser,
  removeRefreshToken,
} from "./auth.service.js";

import {
  requestRegisterOtp,
  requestLoginOtp,
  verifyOtp,
} from "./otp.service.js";

import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from "../../utils/token.js";

import { createAuditLog } from "../audit-logs/audit.service.js";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "none",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const googleCallback = asyncHandler(
  async (req, res) => {
    const {
      user,
      accessToken,
      refreshToken,
    } = await loginWithGoogle(
      req.user
    );

    await createAuditLog({
      actorId: user._id,
      actorRole: user.role,
      action: "LOGIN",
      tenantId: user.tenantId,
      companyId: user.companyId,
      ip: req.ip,
      userAgent:
        req.headers[
          "user-agent"
        ],
    });

    res.cookie(
      "refreshToken",
      refreshToken,
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "none",
        maxAge:
          7 *
          24 *
          60 *
          60 *
          1000,
      }
    );

    res.redirect(
      `${env.CLIENT_URL}/#token=${accessToken}`
    );
  }
);

export const me =
  asyncHandler(
    async (req, res) => {
      const user =
        await getCurrentUser(
          req.user.id
        );

      res
        .status(
          StatusCodes.OK
        )
        .json(
          new ApiResponse(
            StatusCodes.OK,
            "Current user fetched successfully.",
            user
          )
        );
    }
  );

export const refresh =
  asyncHandler(
    async (req, res) => {
      const token =
        req.cookies
          ?.refreshToken;

      if (!token) {
        return res
          .status(
            StatusCodes.UNAUTHORIZED
          )
          .json({
            success: false,
            message:
              "Refresh token missing.",
          });
      }

      let decoded;

      try {
        decoded = verifyToken(
          token,
          process.env
            .REFRESH_TOKEN_SECRET
        );
      } catch (err) {
        throw new ApiError(
          StatusCodes.UNAUTHORIZED,
          "Invalid or expired refresh token."
        );
      }

      const payload = {
        id: decoded.id,
        email:
          decoded.email,
        role:
          decoded.role,
        companyId:
          decoded.companyId,
        tenantId:
          decoded.tenantId,
      };

      const accessToken =
        generateAccessToken(
          payload
        );

      const refreshToken =
        generateRefreshToken(
          payload
        );

      res.cookie(
        "refreshToken",
        refreshToken,
        {
          httpOnly: true,
          secure:
            process.env.NODE_ENV ===
            "production",
          sameSite:
            "none",
          maxAge:
            7 *
            24 *
            60 *
            60 *
            1000,
        }
      );

      res
        .status(
          StatusCodes.OK
        )
        .json(
          new ApiResponse(
            StatusCodes.OK,
            "Token refreshed successfully.",
            {
              accessToken,
            }
          )
        );
    }
  );

export const logout =
  asyncHandler(
    async (req, res) => {
      await createAuditLog({
        actorId:
          req.user.id,
        actorRole:
          req.user.role,
        action:
          "LOGOUT",
        tenantId:
          req.user.tenantId,
        companyId:
          req.user.companyId,
        ip: req.ip,
        userAgent:
          req.headers[
            "user-agent"
          ],
      });

      await removeRefreshToken(
        req.user.id
      );

      res.clearCookie(
        "refreshToken"
      );

      res
        .status(
          StatusCodes.OK
        )
        .json(
          new ApiResponse(
            StatusCodes.OK,
            "Logout successful."
          )
        );
    }
  );

/**
 * Email OTP Authentication
 * (Registration + Login). No password is ever created, stored,
 * or accepted anywhere in this flow.
 */

export const sendRegisterOtp = asyncHandler(async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(new ApiResponse(StatusCodes.BAD_REQUEST, "Name and email are required."));
  }

  const result = await requestRegisterOtp({
    name,
    email,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, "OTP sent to your email.", result));
});

export const verifyRegisterOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(new ApiResponse(StatusCodes.BAD_REQUEST, "Email and OTP are required."));
  }

  const user = await verifyOtp({ email, otp, purpose: "REGISTER" });

  const { accessToken, refreshToken } = await issueSession(user, {
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  await createAuditLog({
    actorId: user._id,
    actorRole: user.role,
    action: "REGISTER",
    tenantId: user.tenantId,
    companyId: user.companyId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

  res.status(StatusCodes.CREATED).json(
    new ApiResponse(StatusCodes.CREATED, "Account created successfully.", {
      user,
      accessToken,
    })
  );
});

export const sendLoginOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(new ApiResponse(StatusCodes.BAD_REQUEST, "Email is required."));
  }

  const result = await requestLoginOtp({
    email,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, "OTP sent to your email.", result));
});

export const verifyLoginOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(new ApiResponse(StatusCodes.BAD_REQUEST, "Email and OTP are required."));
  }

  const user = await verifyOtp({ email, otp, purpose: "LOGIN" });

  const { accessToken, refreshToken } = await issueSession(user, {
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  await createAuditLog({
    actorId: user._id,
    actorRole: user.role,
    action: "LOGIN",
    tenantId: user.tenantId,
    companyId: user.companyId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

  res.status(StatusCodes.OK).json(
    new ApiResponse(StatusCodes.OK, "Login successful.", {
      user,
      accessToken,
    })
  );
});