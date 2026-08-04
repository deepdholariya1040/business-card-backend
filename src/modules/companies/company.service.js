import Company from "./company.model.js";
import User from "../users/user.model.js";

import ApiError from "../../utils/ApiError.js";
import { ROLES } from "../../config/roles.js";

import BusinessCard from "../business-cards/businessCard.model.js";

import {
  assignOrCreateUser,
  notifyAssignmentResult,
  runWithOptionalTransaction,
} from "../users/userAssignment.service.js";


// Get Companies
export const getCompanies = async (currentUser) => {

  if (
    currentUser.role === ROLES.SUPER_ADMIN
  ) {

    return Company.find()
      .populate(
        "mainAdminId",
        "name email"
      );

  }


  return Company.find({
    _id: currentUser.companyId
  })
  .populate(
    "mainAdminId",
    "name email"
  );

};



// Get Single Company
export const getCompanyById = async (id, currentUser) => {
  const company = await Company.findById(id).populate(
    "mainAdminId",
    "name email"
  );

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  if (
    currentUser.role !== ROLES.SUPER_ADMIN &&
    String(company._id) !== String(currentUser.companyId)
  ) {
    throw new ApiError(403, "Access denied.");
  }

  const now = new Date();

  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const startOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  const startOfYear = new Date(
    now.getFullYear(),
    0,
    1
  );

  const [daily, monthly, yearly] = await Promise.all([
    BusinessCard.countDocuments({
      companyId: company._id,
      createdAt: { $gte: startOfDay },
    }),

    BusinessCard.countDocuments({
      companyId: company._id,
      createdAt: { $gte: startOfMonth },
    }),

    BusinessCard.countDocuments({
      companyId: company._id,
      createdAt: { $gte: startOfYear },
    }),
  ]);

  const result = company.toObject();

  result.scanUsage = {
    daily,
    monthly,
    yearly,
  };

  return result;
};

// Create Company
export const createCompany = async (payload) => {

  const {
    // mainAdminName is intentionally ignored - the frontend no longer
    // sends (or is required to send) a name. If an older frontend still
    // sends it, it's simply not used; the backend derives everything
    // else from mainAdminEmail via the shared assign-or-create flow.
    mainAdminName,
    mainAdminEmail,
    scanLimits = {},
    ...companyData
  } = payload;

  if (!mainAdminEmail) {
    throw new ApiError(
      400,
      "Main admin email is required."
    );
  }

  const normalizedEmail =
    String(mainAdminEmail).trim().toLowerCase();

  // Company creation + main-admin assignment touch two collections, so
  // this runs inside a transaction where the deployment supports one
  // (falls back to a plain sequential write on standalone MongoDB).
  const { company, assignment } = await runWithOptionalTransaction(
    async (session) => {

      const createOptions = session ? { session } : undefined;

      const [createdCompany] = await Company.create(
        [
          {
            ...companyData,

            scanLimits: {
              daily: Number(scanLimits.daily ?? 25),
              monthly: Number(scanLimits.monthly ?? 500),
              yearly: Number(scanLimits.yearly ?? 5000),
            },
          },
        ],
        createOptions
      );

      // Assign-or-create the Main Company Admin: if mainAdminEmail
      // already belongs to an existing user, that user is updated
      // in place (no duplicate). Otherwise a new user is created.
      const result = await assignOrCreateUser(
        {
          email: normalizedEmail,
          role: ROLES.MAIN_COMPANY_ADMIN,
          companyId: createdCompany._id,
          tenantId: createdCompany._id,
          canManageStaff: true,
        },
        { session }
      );

      // Link company with main admin
      createdCompany.mainAdminId = result.user._id;

      await createdCompany.save(
        session ? { session } : undefined
      );

      return { company: createdCompany, assignment: result };
    }
  );

  // Best-effort notification email, sent only after the transaction
  // has actually committed.
  notifyAssignmentResult(assignment, {
    companyId: company._id,
  }).catch(() => {});

  return Company.findById(company._id).populate(
    "mainAdminId",
    "name email"
  );
};


// Update Company
export const updateCompany = async (
  id,
  payload,
  currentUser
) => {

  if (
    currentUser.role !==
    ROLES.SUPER_ADMIN
  ) {

    throw new ApiError(
      403,
      "Only Super Admin can update company."
    );
  }


  const company =
    await Company.findById(id);


  if (!company) {
    throw new ApiError(
      404,
      "Company not found."
    );
  }


  return Company.findByIdAndUpdate(
    id,
    payload,
    {
      new: true,
      runValidators: true
    }
  );
};



// Deactivate Company
export const deleteCompany = async (
  id,
  currentUser
) => {

  if (
    currentUser.role !==
    ROLES.SUPER_ADMIN
  ) {

    throw new ApiError(
      403,
      "Only Super Admin can deactivate company."
    );
  }


  const company =
    await Company.findById(id);


  if (!company) {

    throw new ApiError(
      404,
      "Company not found."
    );
  }


  company.isActive = false;

  await company.save();



  await User.updateMany(
    {
      companyId:
      company._id
    },
    [
      {
        $set:{
          previousRole:"$role",

          role:
          ROLES.NORMAL_USER,

          companyId:null,

          tenantId:null,

          canManageStaff:false
        }
      }
    ]
  );


  return company;
};



// Recover Company
export const recoverCompany = async (
  id,
  currentUser
) => {

  if (
    currentUser.role !==
    ROLES.SUPER_ADMIN
  ) {

    throw new ApiError(
      403,
      "Only Super Admin can recover company."
    );
  }


  const company =
    await Company.findById(id);


  if (!company) {
    throw new ApiError(
      404,
      "Company not found."
    );
  }


  company.isActive = true;


  await company.save();



  await User.updateMany(
    {
      previousRole:{
        $ne:null
      }
    },
    [
      {
        $set:{
          role:"$previousRole",
          previousRole:null,
          companyId:company._id,
          tenantId:company._id
        }
      }
    ]
  );


  return company;
};


// Change Main Company Admin
export const changeMainAdmin = async (
  companyId,
  email,
  currentUser
) => {

  if (
    currentUser.role !== ROLES.SUPER_ADMIN
  ) {
    throw new ApiError(
      403,
      "Only Super Admin can change Main Company Admin."
    );
  }


  const company =
    await Company.findById(companyId);


  if (!company) {
    throw new ApiError(
      404,
      "Company not found."
    );
  }


  if (!email) {
    throw new ApiError(
      400,
      "Email is required."
    );
  }

  const normalizedEmail =
    String(email).trim().toLowerCase();


  // Remove old main admin
  if (company.mainAdminId) {

    await User.findByIdAndUpdate(
      company.mainAdminId,
      {
        role:
          ROLES.NORMAL_USER,

        companyId:
          null,

        tenantId:
          null,

        canManageStaff:
          false
      }
    );
  }


  // Assign the new main admin using the shared assign-or-create flow:
  // if a user with this email already exists, it's updated in place
  // (no duplicate); otherwise a new user is created. This keeps the
  // "change main admin" flow consistent with every other role
  // assignment entry point.
  const result =
    await assignOrCreateUser({
      email: normalizedEmail,
      role: ROLES.MAIN_COMPANY_ADMIN,
      companyId: company._id,
      tenantId: company._id,
      canManageStaff: true
    });


  company.mainAdminId =
    result.user._id;


  await company.save();


  notifyAssignmentResult(
    result,
    { companyId: company._id }
  ).catch(() => {});


  return company;
};





// Add Company Admin
export const addCompanyAdmin = async (
  companyId,
  email,
  currentUser
) => {
  if (
    currentUser.role !== ROLES.MAIN_COMPANY_ADMIN
  ) {
    throw new ApiError(
      403,
      "Only Main Company Admin can add Company Admin."
    );
  }

  if (
    String(currentUser.companyId) !== String(companyId)
  ) {
    throw new ApiError(
      403,
      "Access denied."
    );
  }

  if (!email) {
    throw new ApiError(
      400,
      "Email is required."
    );
  }

  const company = await Company.findById(companyId);

  if (!company) {
    throw new ApiError(
      404,
      "Company not found."
    );
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  // Only enforce the admin-count limit when this assignment actually
  // adds a *new* Company Admin to this company - not when re-assigning
  // a user who already holds that exact role/company (a no-op).
  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  const alreadyCompanyAdminHere =
    !!existingUser &&
    existingUser.role === ROLES.COMPANY_ADMIN &&
    !!existingUser.companyId &&
    String(existingUser.companyId) === String(companyId);

  if (!alreadyCompanyAdminHere) {
    const adminCount = await User.countDocuments({
      companyId,
      role: ROLES.COMPANY_ADMIN,
    });

    if (adminCount >= company.maxCompanyAdmins) {
      throw new ApiError(
        400,
        "Company admin limit reached."
      );
    }
  }

  // Assign-or-create: updates the existing user in place if the email
  // is already registered, otherwise creates a new Company Admin.
  const result = await assignOrCreateUser({
    email: normalizedEmail,
    role: ROLES.COMPANY_ADMIN,
    companyId: company._id,
    tenantId: company._id,
    canManageStaff: true,
  });

  notifyAssignmentResult(result, {
    companyId: company._id,
  }).catch(() => {});

  return result.user;
};


// Remove Company Admin
export const removeCompanyAdmin = async (
  userId,
  currentUser
) => {


  if (
    currentUser.role !==
    ROLES.MAIN_COMPANY_ADMIN
  ) {

    throw new ApiError(
      403,
      "Only Main Company Admin can remove Company Admin."
    );
  }



  const user =
    await User.findById(userId);


  if (!user) {
    throw new ApiError(
      404,
      "User not found."
    );
  }


  if (
    String(user.companyId) !==
    String(currentUser.companyId)
  ) {

    throw new ApiError(
      403,
      "Access denied."
    );
  }



  user.role =
    ROLES.NORMAL_USER;

  user.companyId =
    null;

  user.tenantId =
    null;


  await user.save();


  return user;
};





// Add Staff
export const addStaff = async (
  companyId,
  email,
  currentUser
) => {
  if (
    currentUser.role !== ROLES.MAIN_COMPANY_ADMIN &&
    currentUser.role !== ROLES.COMPANY_ADMIN
  ) {
    throw new ApiError(
      403,
      "Only Company Admin can add staff."
    );
  }

  if (
    String(currentUser.companyId) !== String(companyId)
  ) {
    throw new ApiError(
      403,
      "Access denied."
    );
  }

  if (!email) {
    throw new ApiError(
      400,
      "Email is required."
    );
  }

  const company = await Company.findById(companyId);

  if (!company) {
    throw new ApiError(
      404,
      "Company not found."
    );
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Only enforce the staff-count limit when this assignment actually
  // adds a *new* staff member to this company - not when re-assigning
  // a user who already holds that exact role/company (a no-op).
  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  const alreadyStaffHere =
    !!existingUser &&
    existingUser.role === ROLES.STAFF &&
    !!existingUser.companyId &&
    String(existingUser.companyId) === String(companyId);

  if (!alreadyStaffHere) {
    const staffCount = await User.countDocuments({
      companyId,
      role: ROLES.STAFF,
    });

    if (staffCount >= company.maxStaff) {
      throw new ApiError(
        400,
        "Staff limit reached."
      );
    }
  }

  // Assign-or-create: updates the existing user in place if the email
  // is already registered, otherwise creates a new Staff user.
  const result = await assignOrCreateUser({
    email: normalizedEmail,
    role: ROLES.STAFF,
    companyId: company._id,
    tenantId: company._id,
    canManageStaff: false,
  });

  notifyAssignmentResult(result, {
    companyId: company._id,
  }).catch(() => {});

  return result.user;
};


// Remove Staff
export const removeStaff = async (
  userId,
  currentUser
) => {


  if (
    currentUser.role !==
    ROLES.MAIN_COMPANY_ADMIN &&
    currentUser.role !==
    ROLES.COMPANY_ADMIN
  ) {

    throw new ApiError(
      403,
      "Only Company Admin can remove staff."
    );
  }



  const user =
    await User.findById(userId);


  if (!user) {
    throw new ApiError(
      404,
      "User not found."
    );
  }


  if (
    String(user.companyId) !==
    String(currentUser.companyId)
  ) {

    throw new ApiError(
      403,
      "Access denied."
    );
  }



  user.role =
    ROLES.NORMAL_USER;


  user.companyId =
    null;


  user.tenantId =
    null;



  await user.save();


  return user;
};

// Search Companies
export const searchCompanies = async (
  filters,
  currentUser
) => {

  if (
    currentUser.role !==
    ROLES.SUPER_ADMIN
  ) {
    throw new ApiError(
      403,
      "Only Super Admin can search companies."
    );
  }


  const {
    keyword,
    status,
    email
  } = filters;


  let query = {};


  // Search by company name
  if (keyword) {

    query.name = {
      $regex: keyword,
      $options: "i"
    };
  }



  // Search by main admin email
  if (email) {

    const users =
      await User.find({
        email:{
          $regex: email,
          $options:"i"
        }
      })
      .select("_id");


    query.mainAdminId = {
      $in:
        users.map(
          user => user._id
        )
    };
  }



  // Status filter

  if (status === "active") {

    query.isActive = true;

    query["subscription.expiryDate"] = {
      $gt:
        new Date()
    };

  }



  if (status === "blocked") {

    query.isActive = false;

  }



  if (status === "expired") {

    query["subscription.expiryDate"] = {
      $lt:
        new Date()
    };

  }



  return Company.find(query)
    .populate(
      "mainAdminId",
      "name email"
    );

};



// Update Subscription
export const updateSubscription = async (
  companyId,
  payload,
  currentUser
) => {


  if (
    currentUser.role !==
    ROLES.SUPER_ADMIN
  ) {

    throw new ApiError(
      403,
      "Only Super Admin can update subscription."
    );
  }



  const company =
    await Company.findById(
      companyId
    );


  if (!company) {

    throw new ApiError(
      404,
      "Company not found."
    );

  }



  if (
    payload.expiryDate
  ) {

    company.subscription.expiryDate =
      payload.expiryDate;


    company.subscription.isExpired =
      false;

  }



  if (
    payload.startDate
  ) {

    company.subscription.startDate =
      payload.startDate;

  }



  await company.save();


  return company;

};



// Company Statistics
export const getCompanyStats = async (
  currentUser
) => {


  if (
    currentUser.role !==
    ROLES.SUPER_ADMIN
  ) {

    throw new ApiError(
      403,
      "Only Super Admin can view stats."
    );

  }



  const totalCompanies =
    await Company.countDocuments();



  const activeCompanies =
    await Company.countDocuments({
      isActive:true,
      "subscription.expiryDate":{
        $gt:new Date()
      }
    });



  const blockedCompanies =
    await Company.countDocuments({
      isActive:false
    });



  const expiredCompanies =
    await Company.countDocuments({
      "subscription.expiryDate":{
        $lt:new Date()
      }
    });



  const totalUsers =
    await User.countDocuments();



  return {
    totalCompanies,
    activeCompanies,
    blockedCompanies,
    expiredCompanies,
    totalUsers
  };

};

// Get Company Users
export const getCompanyUsers = async (
  companyId,
  currentUser
) => {


  if (
    currentUser.role !== ROLES.SUPER_ADMIN &&
    String(currentUser.companyId) !== String(companyId)
  ) {

    throw new ApiError(
      403,
      "Access denied."
    );

  }



  const users =
    await User.find({
      companyId
    })
    .select(
      "name email role avatar isActive"
    );



  return users;

};

export const changeUserRole = async (
  companyId,
  userId,
  role,
  currentUser
) => {

  const allowedRoles = [
    ROLES.MAIN_COMPANY_ADMIN,
    ROLES.COMPANY_ADMIN,
    ROLES.STAFF,
  ];

  if (!allowedRoles.includes(role)) {
    throw new ApiError(400, "Invalid role.");
  }

  if (
    currentUser.role !== ROLES.SUPER_ADMIN &&
    !(
      currentUser.role === ROLES.MAIN_COMPANY_ADMIN &&
      String(currentUser.companyId) === String(companyId)
    )
  ) {
    throw new ApiError(
      403,
      "Only Super Admin or the company's Main Company Admin can change user roles."
    );
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  if (
    currentUser.role !== ROLES.SUPER_ADMIN &&
    String(user.companyId) !== String(companyId)
  ) {
    throw new ApiError(403, "Access denied.");
  }

  // Main Company Admin cannot change own role
  if (
    currentUser.role === ROLES.MAIN_COMPANY_ADMIN &&
    String(currentUser._id) === String(user._id)
  ) {
    throw new ApiError(
      403,
      "You cannot change your own role."
    );
  }

  // Main Company Admin cannot assign Main Company Admin
  if (
    currentUser.role === ROLES.MAIN_COMPANY_ADMIN &&
    role === ROLES.MAIN_COMPANY_ADMIN
  ) {
    throw new ApiError(
      403,
      "Main Company Admin cannot assign Main Company Admin role."
    );
  }

  // Main Company Admin cannot modify another Main Company Admin
  if (
    currentUser.role === ROLES.MAIN_COMPANY_ADMIN &&
    user.role === ROLES.MAIN_COMPANY_ADMIN
  ) {
    throw new ApiError(
      403,
      "Main Company Admin cannot modify another Main Company Admin."
    );
  }

  // Store previous values before update
  const previousRole = user.role;
  const previousCompanyId = user.companyId
    ? String(user.companyId)
    : null;

  // No change required
  if (
    previousRole === role &&
    previousCompanyId === String(companyId)
  ) {
    return user;
  }

  // Update role
  user.role = role;

  if (role === ROLES.STAFF) {
    user.canManageStaff = false;
  }

  if (
    role === ROLES.COMPANY_ADMIN ||
    role === ROLES.MAIN_COMPANY_ADMIN
  ) {
    user.canManageStaff = true;
  }

  await user.save();

  // Send role change email
  await notifyAssignmentResult(
    {
      user,
      isNewUser: false,
      roleChanged: previousRole !== user.role,
      companyChanged:
        previousCompanyId !==
        (user.companyId
          ? String(user.companyId)
          : null),
    },
    {
      companyId,
    }
  ).catch((err) => {
    console.error(
      "Role change email failed:",
      err.message
    );
  });

  return user;
};