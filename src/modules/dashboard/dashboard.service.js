import BusinessCard from "../business-cards/businessCard.model.js";
import Company from "../companies/company.model.js";
import User from "../users/user.model.js";

export const getDashboardStats = async (user) => {

  const now = new Date();

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const startOfYear = new Date(now.getFullYear(), 0, 1);

  let cardFilter = {};
  let userFilter = {};
  let limits = {
    daily: 0,
    monthly: 0,
    yearly: 0,
  };

  switch (user.role) {
    case "SUPER_ADMIN":
      break;

    case "MAIN_COMPANY_ADMIN":
    case "COMPANY_ADMIN":
    case "STAFF": {
      cardFilter.companyId = user.companyId;
      userFilter.companyId = user.companyId;

      const company = await Company.findById(user.companyId);

      limits = company?.scanLimits || limits;

      break;
    }

    default:
      cardFilter.createdBy = user.id;

      userFilter._id = user.id;

      limits = user.customLimits?.enabled
        ? {
            daily: user.customLimits.daily,

            monthly: user.customLimits.monthly,

            yearly: user.customLimits.yearly,
          }
        : user.scanLimits || limits;
  }

  const [
    totalUsers,
    totalCompanies,
    totalCards,
    todayScans,
    monthlyScans,
    yearlyScans,
  ] = await Promise.all([
    User.countDocuments(userFilter),

    user.role === "SUPER_ADMIN" ? Company.countDocuments() : Promise.resolve(0),

    BusinessCard.countDocuments(cardFilter),

    BusinessCard.countDocuments({
      ...cardFilter,

      createdAt: {
        $gte: startOfDay,
      },
    }),

    BusinessCard.countDocuments({
      ...cardFilter,

      createdAt: {
        $gte: startOfMonth,
      },
    }),

    BusinessCard.countDocuments({
      ...cardFilter,

      createdAt: {
        $gte: startOfYear,
      },
    }),
  ]);

  return {
    totalUsers,
    totalCompanies,
    totalCards,
    todayScans,
    monthlyScans,
    yearlyScans,
    limits,
  };
};
