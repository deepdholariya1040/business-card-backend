import { Router } from "express";

import authMiddleware from "../../middlewares/auth.middleware.js";
import upload from "../../middlewares/upload.middleware.js";

import { scanCard } from "./ocr.controller.js";

const router = Router();

router.use(authMiddleware);

router.post(
  "/scan",
  upload.fields([
    {
      name: "frontImage",
      maxCount: 1
    },
    {
      name: "backImage",
      maxCount: 1
    }
  ]),
  scanCard
);

export default router;