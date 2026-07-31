import crypto from "crypto";

import { env } from "../config/env.js";

/**
 * Double-submit-cookie CSRF protection.
 *
 * Only applied to endpoints that rely on the httpOnly refreshToken
 * cookie (POST /auth/refresh, POST /auth/logout), since those are the
 * only cookie-authenticated (as opposed to Bearer-token-authenticated)
 * mutating endpoints in this API. Endpoints authenticated purely via
 * the `Authorization: Bearer <token>` header are not vulnerable to
 * classic CSRF (a third-party site cannot read/attach that header),
 * so they are intentionally left untouched to avoid breaking the
 * existing frontend integration.
 *
 * Flow:
 *  - GET /auth/csrf-token issues a random token, sent both as a
 *    readable (non-httpOnly) cookie and in the JSON body.
 *  - The frontend echoes it back in the `x-csrf-token` header on
 *    POST /auth/refresh and POST /auth/logout.
 *  - This middleware verifies the header matches the cookie.
 *
 * This is additive: if the frontend does not send the header yet,
 * requests still work in development, and only become strictly
 * enforced once CSRF_STRICT=true is set (see ENVIRONMENT_VARIABLES.md).
 */

const CSRF_COOKIE = "csrfToken";
const CSRF_HEADER = "x-csrf-token";

export const issueCsrfToken = (req, res) => {
  const token = crypto.randomBytes(32).toString("hex");

  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({
    success: true,
    message: "CSRF token issued.",
    data: { csrfToken: token },
  });
};

export const verifyCsrfToken = (req, res, next) => {
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  const strict = String(process.env.CSRF_STRICT).toLowerCase() === "true";

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    if (strict) {
      return res.status(403).json({
        success: false,
        message: "Invalid or missing CSRF token.",
      });
    }
    // Non-strict mode: log only, don't break existing frontend
    // integrations that haven't adopted the header yet.
    req.csrfWarning = "CSRF token missing or invalid (non-strict mode).";
  }

  next();
};
