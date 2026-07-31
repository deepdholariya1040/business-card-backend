import { Router } from "express";

import authMiddleware from "../../middlewares/auth.middleware.js";

import {
  getAllCompanies,
  getSingleCompany,
  createNewCompany,
  updateExistingCompany,
  removeCompany,

  recoverCompanyController,
  changeMainAdminController,

  addCompanyAdminController,
  removeCompanyAdminController,

  addStaffController,
  removeStaffController,

  searchCompanyController,

  updateSubscriptionController,

  companyStatsController,

  getCompanyUsersController,
  changeUserRoleController,

} from "./company.controller.js";


const router = Router();


router.use(authMiddleware);



// Company List
router.get(
  "/",
  getAllCompanies
);



// Company Search
router.get(
  "/search",
  searchCompanyController
);



// Company Stats
router.get(
  "/stats",
  companyStatsController
);



// Company Users
router.get(
  "/:id/users",
  getCompanyUsersController
);



// Single Company
router.get(
  "/:id",
  getSingleCompany
);



// Create Company
router.post(
  "/",
  createNewCompany
);



// Update Company
router.put(
  "/:id",
  updateExistingCompany
);



// Deactivate Company
router.delete(
  "/:id",
  removeCompany
);



// Recover Company
router.put(
  "/:id/recover",
  recoverCompanyController
);



// Change Main Company Admin
router.put(
  "/:id/change-main-admin",
  changeMainAdminController
);



// Add Company Admin
router.post(
  "/:id/admins",
  addCompanyAdminController
);



// Remove Company Admin
router.delete(
  "/:id/admins/:userId",
  removeCompanyAdminController
);



// Add Staff
router.post(
  "/:id/staff",
  addStaffController
);



// Remove Staff
router.delete(
  "/:id/staff/:userId",
  removeStaffController
);



// Update Subscription
router.put(
  "/:id/subscription",
  updateSubscriptionController
);

router.put(
  "/:id/users/:userId/role",
  changeUserRoleController
);


export default router;