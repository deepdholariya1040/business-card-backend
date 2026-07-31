import { Router } from "express";
import passport from "passport";

import authMiddleware from "../../middlewares/auth.middleware.js";
import {
  authRateLimiter,
  otpSendRateLimiter,
} from "../../middlewares/security.middleware.js";
import {
  issueCsrfToken,
  verifyCsrfToken,
} from "../../middlewares/csrf.middleware.js";

import {
  googleCallback,
  me,
  refresh,
  logout,
  sendRegisterOtp,
  verifyRegisterOtp,
  sendLoginOtp,
  verifyLoginOtp,
} from "./auth.controller.js";

const router = Router();

/**
 * Google OAuth (unchanged)
 */
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/",
  }),
  googleCallback
);

/**
 * Session
 */
router.get("/me", authMiddleware, me);
router.get("/csrf-token", issueCsrfToken);
router.post("/refresh", verifyCsrfToken, refresh);
router.post("/logout", authMiddleware, verifyCsrfToken, logout);

/**
 * Email OTP Authentication (no password ever involved)
 */
router.post(
  "/otp/register/send",
  authRateLimiter,
  otpSendRateLimiter,
  sendRegisterOtp
);
router.post("/otp/register/verify", authRateLimiter, verifyRegisterOtp);

router.post(
  "/otp/login/send",
  authRateLimiter,
  otpSendRateLimiter,
  sendLoginOtp
);
router.post("/otp/login/verify", authRateLimiter, verifyLoginOtp);

export default router;
