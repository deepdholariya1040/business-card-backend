import pino from "pino";

import { env } from "./env.js";

/**
 * Structured logger (Pino).
 * Keeps the same call surface the codebase already used
 * (logger.info / logger.warn / logger.error / logger.debug)
 * so no other file needs to change.
 */
const pinoLogger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.otp",
      "*.otpHash",
      "*.refreshToken",
      "*.accessToken",
    ],
    censor: "[REDACTED]",
  },
  transport:
    env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        }
      : undefined,
});

const safeArgs = (args) =>
  args.length === 1 ? args[0] : args.map(String).join(" ");

const logger = {
  info: (...args) => pinoLogger.info(safeArgs(args)),
  warn: (...args) => pinoLogger.warn(safeArgs(args)),
  error: (...args) => pinoLogger.error(safeArgs(args)),
  debug: (...args) => pinoLogger.debug(safeArgs(args)),
  raw: pinoLogger,
};

export default logger;
