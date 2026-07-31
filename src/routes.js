import { Router } from "express";

import authRoutes from "./modules/auth/auth.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import companyRoutes from "./modules/companies/company.routes.js";
import ocrRoutes from "./modules/ocr/ocr.routes.js";
import businessCardRoutes from "./modules/business-cards/businessCard.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import auditLogRoutes from "./modules/audit-logs/auditLog.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/companies", companyRoutes);
router.use("/ocr", ocrRoutes);
router.use("/business-cards", businessCardRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/audit-logs", auditLogRoutes);

export default router;