import logger from "../config/logger.js";
import { env } from "../config/env.js";

/**
 * Centralized error handler.
 * Preserves the original response shape
 * ({ success, statusCode, message }) so existing frontend error
 * handling keeps working unchanged, while adding secure logging and
 * hiding internal error details (stack traces, DB errors, etc.) in
 * production.
 */
/**
 * Normalizes well-known non-operational errors (raw Mongoose/JWT
 * errors that were never wrapped in an ApiError) into the same
 * { statusCode, message } shape ApiError uses, so callers always get
 * a sensible 4xx instead of a generic 500. Purely additive - does
 * not change the response envelope or any already-operational
 * ApiError produced by the controllers/services.
 */
const normalizeKnownErrors = (err) => {
  // Invalid ObjectId passed to findById/findOne/etc. (e.g. a
  // malformed :id route param) - was previously an unhandled 500.
  if (err.name === "CastError" && err.kind === "ObjectId") {
    return {
      statusCode: 400,
      message: `Invalid ${err.path || "id"} format.`,
    };
  }

  // Mongoose schema validation failures.
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors || {})
      .map((e) => e.message)
      .join(" ") || "Validation failed.";
    return { statusCode: 400, message };
  }

  // Duplicate key (unique index) violations, e.g. email already exists.
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    return {
      statusCode: 409,
      message: field
        ? `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`
        : "Duplicate value.",
    };
  }

  // Expired/invalid JWTs that were not already caught locally.
  if (err.name === "TokenExpiredError") {
    return { statusCode: 401, message: "Token has expired." };
  }
  if (err.name === "JsonWebTokenError") {
    return { statusCode: 401, message: "Invalid token." };
  }

  return null;
};

export default (err, req, res, next) => {
  const normalized =
    err.statusCode === undefined ? normalizeKnownErrors(err) : null;

  if (normalized) {
    err.statusCode = normalized.statusCode;
    err.message = normalized.message;
  }

  const statusCode = err.statusCode || err.status || 500;

  const isOperational = err.statusCode !== undefined;

  logger.error({
    message: err.message,
    statusCode,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    stack: env.NODE_ENV !== "production" ? err.stack : undefined,
  });

  const responseMessage =
    isOperational || env.NODE_ENV !== "production"
      ? err.message || "Internal Server Error"
      : "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    statusCode,
    message: responseMessage,
    ...(env.NODE_ENV !== "production" && err.stack
      ? { stack: err.stack }
      : {}),
  });
};
