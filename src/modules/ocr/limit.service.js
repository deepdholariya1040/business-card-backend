import Company from "../companies/company.model.js";
import BusinessCard from "../business-cards/businessCard.model.js";

const DEFAULT_LIMITS = {
  daily: 25,
  monthly: 500,
  yearly: 5000
};

export const checkScanLimits = async (
  user
) => {

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

  let filter = {};
  let limits = {};

  // SUPER ADMIN - unrestricted, no company/tenant scoping applies.
  if (
    user.role ===
    "SUPER_ADMIN"
  ) {

    limits = {
      daily: Infinity,
      monthly: Infinity,
      yearly: Infinity
    };

  } else if (
    // NORMAL USER
    user.role ===
    "NORMAL_USER"
  ) {

    filter.createdBy =
      user.id;

    limits =
      user.customLimits
        ?.enabled
        ? {
            daily:
              user
                .customLimits
                .daily,

            monthly:
              user
                .customLimits
                .monthly,

            yearly:
              user
                .customLimits
                .yearly
          }
        : user.scanLimits ||
          DEFAULT_LIMITS;

  } else {

    // MAIN_COMPANY_ADMIN
    // COMPANY_ADMIN
    // STAFF

    filter.companyId =
      user.companyId;

    const company =
      await Company.findById(
        user.companyId
      );

    limits =
      company?.scanLimits ||
      DEFAULT_LIMITS;

  }

  const [
    dailyCount,
    monthlyCount,
    yearlyCount
  ] = await Promise.all([

    BusinessCard.countDocuments(
      {
        ...filter,

        createdAt: {
          $gte:
            startOfDay
        }
      }
    ),

    BusinessCard.countDocuments(
      {
        ...filter,

        createdAt: {
          $gte:
            startOfMonth
        }
      }
    ),

    BusinessCard.countDocuments(
      {
        ...filter,

        createdAt: {
          $gte:
            startOfYear
        }
      }
    )

  ]);

  const allowed =
    dailyCount <
      limits.daily &&
    monthlyCount <
      limits.monthly &&
    yearlyCount <
      limits.yearly;

  return {

    allowed,

    usage: {
      daily:
        dailyCount,

      monthly:
        monthlyCount,

      yearly:
        yearlyCount
    },

    limits,

    remaining: {

      daily:
        Math.max(
          0,
          limits.daily -
            dailyCount
        ),

      monthly:
        Math.max(
          0,
          limits.monthly -
            monthlyCount
        ),

      yearly:
        Math.max(
          0,
          limits.yearly -
            yearlyCount
        )
    }

  };

};