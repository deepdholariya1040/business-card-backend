import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";

import { env } from "../config/env.js";

/**
 * General API rate limiter.
 * Applied globally to /api. Generous enough not to interfere with
 * normal frontend usage/polling.
 */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

/**
 * Stricter limiter for authentication endpoints
 * (Google callback, OTP send/verify, refresh, login) to slow down
 * brute-force / credential-stuffing / OTP-guessing attempts.
 */
export const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
  },
});

/**
 * Very strict limiter specifically for OTP send/resend, keyed by the
 * requested email address as well as IP, to stop a single attacker
 * from exhausting another user's inbox or hammering one address.
 */
export const otpSendRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.OTP_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip)}:${(req.body?.email || "").toLowerCase().trim()}`,
  message: {
    success: false,
    message: "Too many OTP requests for this email. Please try again later.",
  },
});

/**
 * MongoDB operator injection protection.
 * Strips any keys starting with "$" or containing "." from
 * req.body / req.query / req.params.
 */
export const sanitizeMongo = mongoSanitize({
  replaceWith: "_",
});

/**
 * Lightweight recursive XSS sanitizer for string fields in the
 * request body. Escapes HTML-significant characters so stored/echoed
 * user input can't inject markup or scripts. Intentionally minimal
 * (no external dependency with a bad security track record) and
 * only touches strings, so it never changes field types/shape.
 */
const escapeHtml = (value) =>
  value
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const deepSanitize = (input) => {
  if (typeof input === "string") return escapeHtml(input);

  if (Array.isArray(input)) return input.map(deepSanitize);

  if (input && typeof input === "object") {
    const output = {};
    for (const key of Object.keys(input)) {
      output[key] = deepSanitize(input[key]);
    }
    return output;
  }

  return input;
};

// Fields that must never be HTML-escaped (would corrupt the value).
const SANITIZE_EXCLUDE_KEYS = new Set([
  "password",
  "otp",
  "code",
  "refreshToken",
  "accessToken",
  "email",
]);

export const xssSanitize = (req, res, next) => {
  if (req.body && typeof req.body === "object") {
    const sanitized = {};
    for (const key of Object.keys(req.body)) {
      sanitized[key] = SANITIZE_EXCLUDE_KEYS.has(key)
        ? req.body[key]
        : deepSanitize(req.body[key]);
    }
    req.body = sanitized;
  }
  next();
};
