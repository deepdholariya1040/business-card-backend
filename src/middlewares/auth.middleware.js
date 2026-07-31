import jwt from "jsonwebtoken";

import User from "../modules/users/user.model.js";

const authMiddleware = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const token = authorization.split(" ")[1];

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decoded.id).select("-refreshToken");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive.",
      });
    }

    req.user = {
      id: user._id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      tenantId: user.tenantId,
      canManageStaff: user.canManageStaff,

      // Add these two fields
      scanLimits: user.scanLimits,
      customLimits: user.customLimits,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

export default authMiddleware;
