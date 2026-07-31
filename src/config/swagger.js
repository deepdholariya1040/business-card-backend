import swaggerJSDoc from "swagger-jsdoc";

import { env } from "./env.js";

const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "OCR SaaS Backend API",
      version: "1.0.0",
      description:
        "Multi-tenant OCR SaaS platform API. Authentication: Google OAuth or Email OTP (no password auth is supported). See RBAC.md for role permissions and SECURITY.md for security details.",
    },
    servers: [
      { url: `${env.API_PREFIX}`, description: "Current environment" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Auth", description: "Google OAuth + Email OTP authentication" },
      { name: "Users", description: "User management (RBAC scoped)" },
      { name: "Companies", description: "Company / tenant management" },
      { name: "Business Cards", description: "OCR business card records" },
      { name: "OCR", description: "OCR scan processing" },
      { name: "Dashboard", description: "Analytics & summaries" },
      { name: "Audit Logs", description: "Security & activity audit trail" },
    ],
  },
  apis: ["./src/modules/**/*.routes.js"],
});

export default swaggerSpec;
