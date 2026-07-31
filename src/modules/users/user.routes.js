import { Router } from "express";

import authMiddleware from "../../middlewares/auth.middleware.js";

import {
  getAllUsers,
  getAllCompanyUsers,
  getSingleUser,
  getUserCardsController,
  createNewUser,
  updateExistingUser,
  removeUser,
} from "./user.controller.js";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ======================================================
// USERS
// ======================================================

// Super Admin -> Normal Users
router.get(
  "/",
  getAllUsers
);

// Company Users (Super Admin / Main Company Admin / Company Admin)
router.get(
  "/company-users",
  getAllCompanyUsers
);

// ======================================================
// USER CARDS
// IMPORTANT:
// This route must be above "/:id"
// ======================================================
router.get(
  "/:id/cards",
  getUserCardsController
);

// ======================================================
// SINGLE USER
// ======================================================
router.get(
  "/:id",
  getSingleUser
);

// ======================================================
// CREATE USER
// ======================================================
router.post(
  "/",
  createNewUser
);

// ======================================================
// UPDATE USER
// ======================================================
router.put(
  "/:id",
  updateExistingUser
);

// ======================================================
// DELETE USER
// ======================================================
router.delete(
  "/:id",
  removeUser
);

export default router;