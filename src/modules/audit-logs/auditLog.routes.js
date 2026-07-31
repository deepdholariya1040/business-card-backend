import { Router } from "express";

import authMiddleware from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import { ROLES } from "../../config/roles.js";

import {
  getAllAuditLogs
} from "./auditLog.controller.js";

const router = Router();

router.use(
  authMiddleware
);

router.get(
  "/",
  roleMiddleware(
    ROLES.SUPER_ADMIN,
    ROLES.MAIN_COMPANY_ADMIN,
    ROLES.COMPANY_ADMIN
  ),
  getAllAuditLogs
);

export default router;