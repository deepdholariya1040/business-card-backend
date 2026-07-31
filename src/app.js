import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import hpp from "hpp";
import morgan from "morgan";
import passport from "passport";
import swaggerUi from "swagger-ui-express";

import { env, validateEnv } from "./config/env.js";
import logger from "./config/logger.js";
import swaggerSpec from "./config/swagger.js";
import "./config/passport.js";

import routes from "./routes.js";
import ApiError from "./utils/ApiError.js";
import {
  apiRateLimiter,
  sanitizeMongo,
  xssSanitize,
} from "./middlewares/security.middleware.js";
import errorMiddleware from "./middlewares/error.middleware.js";
import responseMapper from "./middlewares/responseMapper.middleware.js";

validateEnv(logger);

const app = express();

// Trust the first proxy hop (Nginx/Render/Railway) so req.ip,
// secure cookies and rate limiting see the real client IP.
app.set("trust proxy", 1);

/**
 * CORS
 * Whitelist-based instead of a single origin, but always includes
 * the existing CLIENT_URL so the current frontend keeps working.
 */
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // same-origin / server-to-server / curl
      if (env.CORS_ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      logger.warn(`Blocked CORS request from origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

/**
 * Security headers
 */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // keep /uploads images loadable cross-origin by the existing frontend
  })
);
app.use(hpp());

/**
 * Compression & Logging
 */
app.use(compression());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

/**
 * Body Parsers
 */
app.use(
  express.json({
    limit: env.JSON_BODY_LIMIT,
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: env.JSON_BODY_LIMIT,
  })
);

/**
 * Sanitization (NoSQL injection + XSS)
 * Applied after body parsing, before routes.
 */
app.use(sanitizeMongo);
app.use(xssSanitize);

/**
 * Cookies
 */
app.use(cookieParser());

/**
 * Global API rate limiting (auth-specific limiter is applied on
 * top of this inside auth.routes.js)
 */
app.use("/api", apiRateLimiter);

/**
 * Passport
 */
app.use(passport.initialize());

/**
 * Static Files (uploads)
 * Unchanged storage location (src/uploads) and unchanged public
 * path (/uploads) for full backward compatibility with existing
 * stored image URLs and frontend rendering.
 */
app.use(
  "/uploads",
  express.static("src/uploads", {
    maxAge: "7d",
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

/**
 * API Documentation
 */
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * API Routes
 * Existing prefix (/api) is preserved exactly. /api/v1 is added as
 * an alias only, so any client that starts using versioned URLs
 * gets the same behavior, without requiring the existing frontend
 * (which calls /api/...) to change anything.
 */
app.use("/api", responseMapper, routes);
app.use(`${env.API_PREFIX}/v1`, responseMapper, routes);

/**
 * Health Check
 */
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "OCR SaaS Backend is running.",
    environment: env.NODE_ENV,
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

/**
 * 404 Handler
 */
app.use((req, res, next) => {
  next(new ApiError(404, "Route not found."));
});

/**
 * Global Error Handler (centralized)
 */
app.use(errorMiddleware);

export default app;
