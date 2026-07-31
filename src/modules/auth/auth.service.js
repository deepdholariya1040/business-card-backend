import User from "../users/user.model.js";

import {
  generateAccessToken,
  generateRefreshToken
} from "../../utils/token.js";

/**
 * Shared session-issuing logic used by both Google OAuth login and
 * Email OTP login, so both providers get identical token payloads,
 * refresh-token persistence, and login metadata tracking.
 */
export const issueSession = async (user, { ip, userAgent } = {}) => {
  const payload = {
    id: user._id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    tenantId: user.tenantId
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  user.refreshToken = refreshToken;
  user.lastLoginAt = new Date();
  if (ip) user.lastLoginIp = ip;
  if (userAgent) user.lastLoginDevice = userAgent;

  await user.save();

  return { user, accessToken, refreshToken };
};

export const loginWithGoogle = async (
  user
) => {
  return issueSession(user);
};

export const getCurrentUser =
  async (userId) => {
    return User.findById(
      userId
    ).select(
      "-refreshToken -__v"
    );
  };

export const removeRefreshToken =
  async (userId) => {
    return User.findByIdAndUpdate(
      userId,
      {
        refreshToken: null
      },
      {
        new: true
      }
    );
  };