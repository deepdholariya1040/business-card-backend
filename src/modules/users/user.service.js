import User from "./user.model.js";
import Company from "../companies/company.model.js";
import BusinessCard from "../business-cards/businessCard.model.js";

import { ROLES } from "../../config/roles.js";
import ApiError from "../../utils/ApiError.js";

// NORMAL USERS ONLY
export const getUsers = async () => {
  return User.find({
    role: ROLES.NORMAL_USER
  })
    .select("-refreshToken")
    .sort({ createdAt: -1 });
};

// COMPANY USERS ONLY
export const getCompanyUsers = async (filter = {}) => {
  const query = {
    ...filter,
  };

  // Jab role filter na ho tabhi sab roles lao
  if (!filter.role) {
    query.role = {
      $in: [
        ROLES.MAIN_COMPANY_ADMIN,
        ROLES.COMPANY_ADMIN,
        ROLES.STAFF,
      ],
    };
  }

  return User.find(query)
    .select("-refreshToken")
    .sort({ createdAt: -1 });
};
export const getUserById = async (
  id
) => {

  const user =
    await User.findById(id)
      .select("-refreshToken");

  if (!user) {
    throw new ApiError(
      404,
      "User not found."
    );
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

  const [
    totalCards,
    todayScans,
    monthlyScans,
    yearlyScans
  ] = await Promise.all([

    BusinessCard.countDocuments({
      createdBy: user._id
    }),

    BusinessCard.countDocuments({
      createdBy: user._id,
      createdAt: {
        $gte: startOfDay
      }
    }),

    BusinessCard.countDocuments({
      createdBy: user._id,
      createdAt: {
        $gte: startOfMonth
      }
    }),

    BusinessCard.countDocuments({
      createdBy: user._id,
      createdAt: {
        $gte: startOfYear
      }
    })

  ]);

  return {
    ...user.toObject(),

    totalCards,
    todayScans,
    monthlyScans,
    yearlyScans
  };

};

export const createUser = async (
  currentUser,
  payload
) => {

  const {
    name,
    email,
    role,
    companyId = null,
    canManageStaff = false
  } = payload;

  const existingUser =
    await User.findOne({
      email
    });

  if (existingUser) {
    throw new ApiError(
      409,
      "User already exists."
    );
  }

  switch (
    currentUser.role
  ) {

    case ROLES.SUPER_ADMIN:

      if (
        role !==
        ROLES.MAIN_COMPANY_ADMIN
      ) {
        throw new ApiError(
          403,
          "Super Admin can only create Main Company Admins."
        );
      }

      break;



    case ROLES.MAIN_COMPANY_ADMIN:

      if (
        role !==
        ROLES.COMPANY_ADMIN
      ) {
        throw new ApiError(
          403,
          "Main Company Admin can only create Company Admins."
        );
      }

      break;



    case ROLES.COMPANY_ADMIN:

      if (
        role !==
        ROLES.STAFF
      ) {
        throw new ApiError(
          403,
          "Company Admin can only create Staff."
        );
      }

      if (
        !currentUser.canManageStaff
      ) {
        throw new ApiError(
          403,
          "You do not have permission to manage staff."
        );
      }

      break;



    default:

      throw new ApiError(
        403,
        "You do not have permission to create users."
      );

  }

  let company = null;

  if (companyId) {

    company =
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
      role ===
      ROLES.COMPANY_ADMIN
    ) {

      const adminCount =
        await User.countDocuments(
          {
            companyId,
            role:
              ROLES.COMPANY_ADMIN
          }
        );

      if (
        adminCount >=
        company.maxCompanyAdmins
      ) {
        throw new ApiError(
          400,
          "Company Admin limit reached."
        );
      }
    }

    if (
      role ===
      ROLES.STAFF
    ) {

      const staffCount =
        await User.countDocuments(
          {
            companyId,
            role:
              ROLES.STAFF
          }
        );

      if (
        staffCount >=
        company.maxStaff
      ) {
        throw new ApiError(
          400,
          "Staff limit reached."
        );
      }
    }
  }

  return User.create({
    name,
    email,
    role,
    companyId,
    tenantId:
      companyId,
    canManageStaff,
    createdBy:
      currentUser._id
  });

};

export const updateUser = async (
  id,
  payload
) => {

  // Protected fields
  delete payload.email;
  delete payload.role;
  delete payload.googleId;
  delete payload.companyId;
  delete payload.tenantId;
  delete payload.createdBy;
  delete payload.previousRole;

  return User.findByIdAndUpdate(
    id,
    payload,
    {
      new: true,
      runValidators: true
    }
  ).select(
    "-refreshToken"
  );

};

export const deleteUser = async (
  id
) => {

  return User.findByIdAndDelete(
    id
  );

};

// GET ALL CARDS OF A USER
export const getUserCards =
  async (userId) => {

    return BusinessCard.find({
      createdBy: userId
    }).sort({
      createdAt: -1
    });

};