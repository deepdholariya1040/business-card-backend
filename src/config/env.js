import dotenv from "dotenv";

dotenv.config();

/**
 * Centralized environment configuration.
 *
 * IMPORTANT (backward compatibility):
 * All variable names that already existed in the original .env
 * (MONGODB_URI, ACCESS_TOKEN_SECRET, ACCESS_TOKEN_EXPIRES_IN,
 * REFRESH_TOKEN_SECRET, REFRESH_TOKEN_EXPIRES_IN, GOOGLE_*, CLIENT_URL,
 * PORT, NODE_ENV, PYTHON_SERVICE_URL) are kept EXACTLY as-is so the
 * existing Google OAuth / JWT / OCR flow keeps working without any
 * changes to your existing deployment secrets.
 *
 * New variables are additive and all have safe defaults, so nothing
 * breaks if they are not present in an existing .env file.
 */

const required = (name, fallback = undefined) => {
  const value = process.env[name] ?? fallback;
  return value;
};

const toInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value, fallback) => {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === "true";
};

const toList = (value, fallback = []) => {
  if (!value) return fallback;
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};

export const env = {
  NODE_ENV: required("NODE_ENV", "development"),
  PORT: toInt(process.env.PORT, 5000),
  API_PREFIX: required("API_PREFIX", "/api"),

  // Existing (unchanged names, still authoritative)
  MONGODB_URI: required("MONGODB_URI"),
  CLIENT_URL: required("CLIENT_URL", "http://localhost:5173"),

  GOOGLE_CLIENT_ID: required("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: required("GOOGLE_CLIENT_SECRET"),
  GOOGLE_CALLBACK_URL: required("GOOGLE_CALLBACK_URL"),

  ACCESS_TOKEN_SECRET: required("ACCESS_TOKEN_SECRET"),
  ACCESS_TOKEN_EXPIRES_IN: required("ACCESS_TOKEN_EXPIRES_IN", "30m"),
  REFRESH_TOKEN_SECRET: required("REFRESH_TOKEN_SECRET"),
  REFRESH_TOKEN_EXPIRES_IN: required("REFRESH_TOKEN_EXPIRES_IN", "7d"),

  PYTHON_SERVICE_URL: required("PYTHON_SERVICE_URL"),

  // New: server-side base URL, used to build absolute image URLs
  // (falls back to building from request host if not set)
  SERVER_URL: required("SERVER_URL", ""),

  // New: CORS whitelist (comma separated). Falls back to CLIENT_URL only.
  CORS_ALLOWED_ORIGINS: toList(
    process.env.CORS_ALLOWED_ORIGINS,
    [required("CLIENT_URL", "http://localhost:5173")]
  ),

  // New: Email OTP auth
  SMTP_HOST: required("SMTP_HOST", ""),
  SMTP_PORT: toInt(process.env.SMTP_PORT, 587),
  SMTP_SECURE: toBool(process.env.SMTP_SECURE, false),
  SMTP_USER: required("SMTP_USER", ""),
  SMTP_PASS: required("SMTP_PASS", ""),
  MAIL_FROM: required("MAIL_FROM", "no-reply@ocr-saas.local"),

  OTP_LENGTH: toInt(process.env.OTP_LENGTH, 6),
  OTP_EXPIRY_MINUTES: toInt(process.env.OTP_EXPIRY_MINUTES, 5),
  OTP_MAX_ATTEMPTS: toInt(process.env.OTP_MAX_ATTEMPTS, 5),
  OTP_RESEND_COOLDOWN_SECONDS: toInt(
    process.env.OTP_RESEND_COOLDOWN_SECONDS,
    60
  ),
  OTP_MAX_PER_HOUR: toInt(process.env.OTP_MAX_PER_HOUR, 5),

  // New: scan limit defaults (used only when a user/company has no
  // explicit limits set - existing per-document limits always win)
  DEFAULT_NORMAL_USER_SCAN_LIMIT_DAILY: toInt(
    process.env.DEFAULT_NORMAL_USER_SCAN_LIMIT_DAILY,
    25
  ),
  DEFAULT_NORMAL_USER_SCAN_LIMIT_MONTHLY: toInt(
    process.env.DEFAULT_NORMAL_USER_SCAN_LIMIT_MONTHLY,
    500
  ),
  DEFAULT_NORMAL_USER_SCAN_LIMIT_YEARLY: toInt(
    process.env.DEFAULT_NORMAL_USER_SCAN_LIMIT_YEARLY,
    5000
  ),
  DEFAULT_COMPANY_SCAN_LIMIT_DAILY: toInt(
    process.env.DEFAULT_COMPANY_SCAN_LIMIT_DAILY,
    100
  ),
  DEFAULT_COMPANY_SCAN_LIMIT_MONTHLY: toInt(
    process.env.DEFAULT_COMPANY_SCAN_LIMIT_MONTHLY,
    10000
  ),
  DEFAULT_COMPANY_SCAN_LIMIT_YEARLY: toInt(
    process.env.DEFAULT_COMPANY_SCAN_LIMIT_YEARLY,
    100000
  ),
  DEFAULT_STAFF_SCAN_LIMIT_DAILY: toInt(
    process.env.DEFAULT_STAFF_SCAN_LIMIT_DAILY,
    50
  ),
  DEFAULT_STAFF_SCAN_LIMIT_MONTHLY: toInt(
    process.env.DEFAULT_STAFF_SCAN_LIMIT_MONTHLY,
    1000
  ),
  DEFAULT_STAFF_SCAN_LIMIT_YEARLY: toInt(
    process.env.DEFAULT_STAFF_SCAN_LIMIT_YEARLY,
    10000
  ),

  // New: uploads
  MAX_FILE_SIZE_MB: toInt(process.env.MAX_FILE_SIZE_MB, 10),
  MAX_UPLOADS_PER_REQUEST: toInt(process.env.MAX_UPLOADS_PER_REQUEST, 2),
  UPLOAD_DRIVER: required("UPLOAD_DRIVER", "local"), // local | s3 | cloudinary | gcs

  // New: rate limiting
  RATE_LIMIT_WINDOW_MINUTES: toInt(
    process.env.RATE_LIMIT_WINDOW_MINUTES,
    15
  ),
  RATE_LIMIT_MAX: toInt(process.env.RATE_LIMIT_MAX, 300),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: toInt(
    process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES,
    15
  ),
  AUTH_RATE_LIMIT_MAX: toInt(process.env.AUTH_RATE_LIMIT_MAX, 20),

  // New: request size limits
  JSON_BODY_LIMIT: required("JSON_BODY_LIMIT", "10mb"),

  // New: logging
  LOG_LEVEL: required("LOG_LEVEL", "info"),
};

/**
 * Fail fast on missing secrets that are required for the app to
 * function correctly (auth would silently misbehave otherwise).
 * This does NOT change any behavior of existing flows - it just
 * surfaces misconfiguration at boot instead of at request time.
 */
export const validateEnv = (logger = console) => {
  const missing = [];

  const criticalInProduction = [
    ["MONGODB_URI", env.MONGODB_URI],
    ["ACCESS_TOKEN_SECRET", env.ACCESS_TOKEN_SECRET],
    ["REFRESH_TOKEN_SECRET", env.REFRESH_TOKEN_SECRET],
  ];

  for (const [name, value] of criticalInProduction) {
    if (!value) missing.push(name);
  }

  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(
      ", "
    )}`;

    if (env.NODE_ENV === "production") {
      throw new Error(message);
    } else {
      logger.warn?.(`[env] ${message} (continuing in ${env.NODE_ENV})`);
    }
  }

  if (
    env.ACCESS_TOKEN_SECRET &&
    env.ACCESS_TOKEN_SECRET === env.REFRESH_TOKEN_SECRET
  ) {
    logger.warn?.(
      "[env] ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET are identical. Use two different secrets in production."
    );
  }

  if (
    env.NODE_ENV === "production" &&
    (!env.SMTP_HOST || !env.SMTP_USER)
  ) {
    logger.warn?.(
      "[env] SMTP is not configured - Email OTP will only log OTP codes to the server console instead of sending real emails."
    );
  }
};

export default env;
