import ApiError from "../utils/ApiError.js";

const tenantMiddleware = (
  req,
  res,
  next
) => {
  const {
    role,
    companyId,
    tenantId
  } = req.user;

  // Roles that do not require
  // tenant/company validation.
  if (
    role ===
      "SUPER_ADMIN" ||
    role ===
      "NORMAL_USER" ||
    role === "STAFF"
  ) {
    return next();
  }

  // MAIN_COMPANY_ADMIN and
  // COMPANY_ADMIN must belong
  // to a company and tenant.
  if (
    !companyId ||
    !tenantId
  ) {
    return next(
      new ApiError(
        403,
        "Tenant information is missing."
      )
    );
  }

  req.companyId =
    companyId;

  req.tenantId =
    tenantId;

  next();
};

export default tenantMiddleware;