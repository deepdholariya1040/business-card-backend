import { Router } from "express";

import authMiddleware from "../../middlewares/auth.middleware.js";
import tenantMiddleware from "../../middlewares/tenant.middleware.js";

import {
  getAllBusinessCards,
  getSingleBusinessCard,
  updateExistingBusinessCard,
  removeBusinessCard
} from "./businessCard.controller.js";

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

router.get("/", getAllBusinessCards);

router.get("/:id", getSingleBusinessCard);

router.put("/:id", updateExistingBusinessCard);

router.delete("/:id", removeBusinessCard);

export default router;