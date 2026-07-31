import jwt from "jsonwebtoken";

export const generateAccessToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn:
        process.env.ACCESS_TOKEN_EXPIRES_IN ||
        "15m"
    }
  );
};

export const generateRefreshToken = (
  payload
) => {
  return jwt.sign(
    payload,
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn:
        process.env.REFRESH_TOKEN_EXPIRES_IN ||
        "7d"
    }
  );
};

export const verifyToken = (
  token,
  secret
) => {
  return jwt.verify(token, secret);
};

export const decodeToken = (
  token
) => {
  return jwt.decode(token);
};