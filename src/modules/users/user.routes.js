import { Router } from "express";

import authMiddleware from "../../middlewares/auth.middleware.js";

import {
  getAllUsers,
  getAllSuperAdmins,
  getAllCompanyUsers,
  getSingleUser,
  getUserCardsController,
  createNewUser,
  createSuperAdmin,
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

// Super Admin -> Super Admins
router.get(
  "/super-admins",
  getAllSuperAdmins
);

// Company Users
// (Super Admin / Main Company Admin / Company Admin)
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
// CREATE SUPER ADMIN
// ======================================================

router.post(
  "/super-admin",
  createSuperAdmin
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