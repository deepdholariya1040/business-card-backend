import { StatusCodes } from "http-status-codes";

import ApiError from "../../utils/ApiError.js";
import ApiResponse from "../../utils/ApiResponse.js";
import asyncHandler from "../../utils/asyncHandler.js";

import {
  getCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
  recoverCompany,
  changeMainAdmin,
  addCompanyAdmin,
  removeCompanyAdmin,
  addStaff,
  removeStaff,
  searchCompanies,
  updateSubscription,
  getCompanyStats,
  getCompanyUsers,
  changeUserRole
} from "./company.service.js";

import { createAuditLog } from "../audit-logs/audit.service.js";



// GET ALL COMPANIES
export const getAllCompanies =
asyncHandler(async(req,res)=>{

 const companies =
 await getCompanies(req.user);


 res.status(StatusCodes.OK)
 .json(
  new ApiResponse(
   StatusCodes.OK,
   "Companies fetched successfully.",
   companies
  )
 );

});




// GET SINGLE COMPANY
export const getSingleCompany =
asyncHandler(async(req,res)=>{


 const company =
 await getCompanyById(
  req.params.id,
  req.user
 );


 res.status(StatusCodes.OK)
 .json(
  new ApiResponse(
   StatusCodes.OK,
   "Company fetched successfully.",
   company
  )
 );


});





// CREATE COMPANY
export const createNewCompany =
asyncHandler(async(req,res)=>{


 if(req.user.role !== "SUPER_ADMIN"){
  throw new ApiError(
   403,
   "Only Super Admin can create company."
  );
 }


 const company =
 await createCompany(
  req.body
 );


 res.status(StatusCodes.CREATED)
 .json(
  new ApiResponse(
   StatusCodes.CREATED,
   "Company created successfully.",
   company
  )
 );


});





// UPDATE COMPANY
export const updateExistingCompany =
asyncHandler(async(req,res)=>{


 const company =
 await updateCompany(
  req.params.id,
  req.body,
  req.user
 );


 res.status(200)
 .json(
  new ApiResponse(
   200,
   "Company updated successfully.",
   company
  )
 );


});





// DELETE / DEACTIVATE COMPANY
export const removeCompany =
asyncHandler(async(req,res)=>{


 const company =
 await deleteCompany(
  req.params.id,
  req.user
 );


 res.status(200)
 .json(
  new ApiResponse(
   200,
   "Company deactivated successfully.",
   company
  )
 );


});





// RECOVER COMPANY
export const recoverCompanyController =
asyncHandler(async(req,res)=>{


 const company =
 await recoverCompany(
  req.params.id,
  req.user
 );


 res.status(200)
 .json(
  new ApiResponse(
   200,
   "Company recovered successfully.",
   company
  )
 );


});





// CHANGE MAIN ADMIN
export const changeMainAdminController =
asyncHandler(async(req,res)=>{


 const {
  email
 } = req.body;


 if(!email){
  throw new ApiError(
   400,
   "Email is required."
  );
 }


 const company =
 await changeMainAdmin(
  req.params.id,
  email,
  req.user
 );


 res.status(200)
 .json(
  new ApiResponse(
   200,
   "Main admin changed successfully.",
   company
  )
 );


});





// ADD COMPANY ADMIN
export const addCompanyAdminController =
asyncHandler(async(req,res)=>{


 const user =
 await addCompanyAdmin(
  req.params.id,
  req.body.email,
  req.user
 );


 res.status(200)
 .json(
  new ApiResponse(
   200,
   "Company Admin added successfully.",
   user
  )
 );


});





// REMOVE COMPANY ADMIN
export const removeCompanyAdminController =
asyncHandler(async(req,res)=>{


 const user =
 await removeCompanyAdmin(
  req.params.userId,
  req.user
 );


 res.status(200)
 .json(
  new ApiResponse(
   200,
   "Company Admin removed successfully.",
   user
  )
 );


});





// ADD STAFF
export const addStaffController =
asyncHandler(async(req,res)=>{


 const user =
 await addStaff(
  req.params.id,
  req.body.email,
  req.user
 );


 res.status(200)
 .json(
  new ApiResponse(
   200,
   "Staff added successfully.",
   user
  )
 );


});





// REMOVE STAFF
export const removeStaffController =
asyncHandler(async(req,res)=>{


 const user =
 await removeStaff(
  req.params.userId,
  req.user
 );


 res.status(200)
 .json(
  new ApiResponse(
   200,
   "Staff removed successfully.",
   user
  )
 );


});





// SEARCH COMPANY
export const searchCompanyController =
asyncHandler(async(req,res)=>{


 const companies =
 await searchCompanies(
  req.query,
  req.user
 );


 res.status(200)
 .json(
  new ApiResponse(
   200,
   "Companies searched successfully.",
   companies
  )
 );


});





// UPDATE SUBSCRIPTION
export const updateSubscriptionController =
asyncHandler(async(req,res)=>{


 const company =
 await updateSubscription(
  req.params.id,
  req.body,
  req.user
 );


 res.status(200)
 .json(
  new ApiResponse(
   200,
   "Subscription updated successfully.",
   company
  )
 );


});





// COMPANY STATS
export const companyStatsController =
asyncHandler(async(req,res)=>{


 const stats =
 await getCompanyStats(
  req.user
 );


 res.status(200)
 .json(
  new ApiResponse(
   200,
   "Company stats fetched successfully.",
   stats
  )
 );


});

// GET COMPANY USERS
export const getCompanyUsersController =
asyncHandler(async(req,res)=>{


 const users =
 await getCompanyUsers(
  req.params.id,
  req.user
 );


 res.status(StatusCodes.OK)
 .json(
  new ApiResponse(
   StatusCodes.OK,
   "Company users fetched successfully.",
   users
  )
 );


});

export const changeUserRoleController =
  asyncHandler(
    async (req, res) => {

      const user =
        await changeUserRole(
          req.params.id,
          req.params.userId,
          req.body.role,
          req.user
        );

      res.status(200).json(
        new ApiResponse(
          200,
          "Role changed successfully.",
          user
        )
      );

    }
  );