// import crypto from "crypto";

// import Otp from "./otp.model.js";
// import User from "../users/user.model.js";
// import ApiError from "../../utils/ApiError.js";
// import { env } from "../../config/env.js";
// import { sendOtpEmail } from "../../services/email.service.js";

// const generateNumericOtp = (length) => {
//   const digits = "0123456789";
//   let otp = "";
//   for (let i = 0; i < length; i++) {
//     otp += digits[crypto.randomInt(0, digits.length)];
//   }
//   return otp;
// };

// const hashOtp = (otp) =>
//   crypto.createHash("sha256").update(otp).digest("hex");

// /**
//  * Request an OTP for registration.
//  * purpose=REGISTER requires name+email and no existing account.
//  */
// export const requestRegisterOtp = async ({ name, email, ip, userAgent }) => {
//   const existing = await User.findOne({ email: email.toLowerCase() });

//   if (existing) {
//     throw new ApiError(
//       409,
//       "An account with this email already exists. Please log in instead."
//     );
//   }

//   return issueOtp({
//     email,
//     purpose: "REGISTER",
//     pendingName: name,
//     ip,
//     userAgent,
//   });
// };

// /**
//  * Request an OTP for login. Requires an existing EMAIL-provider
//  * account (Google accounts should continue to use Google login).
//  */
// export const requestLoginOtp = async ({ email, ip, userAgent }) => {
//   const user = await User.findOne({ email: email.toLowerCase() });

//   if (!user) {
//     throw new ApiError(
//       404,
//       "No account found with this email. Please register first."
//     );
//   }

//   if (!user.isActive) {
//     throw new ApiError(403, "This account has been deactivated.");
//   }

//   return issueOtp({ email, purpose: "LOGIN", ip, userAgent });
// };

// const issueOtp = async ({ email, purpose, pendingName, ip, userAgent }) => {
//   const normalizedEmail = email.toLowerCase().trim();

//   const recent = await Otp.findOne({
//     email: normalizedEmail,
//     purpose,
//     consumed: false,
//   }).sort({ createdAt: -1 });

//   if (recent) {
//     const secondsSinceIssued =
//       (Date.now() - recent.createdAt.getTime()) / 1000;

//     if (secondsSinceIssued < env.OTP_RESEND_COOLDOWN_SECONDS) {
//       const wait = Math.ceil(
//         env.OTP_RESEND_COOLDOWN_SECONDS - secondsSinceIssued
//       );
//       throw new ApiError(
//         429,
//         `Please wait ${wait}s before requesting another code.`
//       );
//     }
//   }

//   const otp = generateNumericOtp(env.OTP_LENGTH);
//   const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

//   await Otp.create({
//     email: normalizedEmail,
//     otpHash: hashOtp(otp),
//     purpose,
//     pendingName: pendingName || null,
//     maxAttempts: env.OTP_MAX_ATTEMPTS,
//     ip,
//     userAgent,
//     expiresAt,
//   });

//   await sendOtpEmail(normalizedEmail, otp, purpose);

//   return {
//     email: normalizedEmail,
//     expiresInSeconds: env.OTP_EXPIRY_MINUTES * 60,
//   };
// };

// /**
//  * Verifies an OTP. On success for REGISTER, creates the user.
//  * Returns the resolved user document.
//  */
// export const verifyOtp = async ({ email, otp, purpose }) => {
//   const normalizedEmail = email.toLowerCase().trim();

//   const record = await Otp.findOne({
//     email: normalizedEmail,
//     purpose,
//     consumed: false,
//   }).sort({ createdAt: -1 });

//   if (!record) {
//     throw new ApiError(400, "No active verification code found. Please request a new one.");
//   }

//   if (record.expiresAt.getTime() < Date.now()) {
//     throw new ApiError(400, "This code has expired. Please request a new one.");
//   }

//   if (record.attempts >= record.maxAttempts) {
//     throw new ApiError(429, "Too many incorrect attempts. Please request a new code.");
//   }

//   if (hashOtp(otp) !== record.otpHash) {
//     record.attempts += 1;
//     await record.save();

//     const remaining = record.maxAttempts - record.attempts;
//     throw new ApiError(
//       400,
//       remaining > 0
//         ? `Incorrect code. ${remaining} attempt(s) remaining.`
//         : "Incorrect code. No attempts remaining, please request a new code."
//     );
//   }

//   record.consumed = true;
//   await record.save();

//   if (purpose === "REGISTER") {
//     const existing = await User.findOne({ email: normalizedEmail });
//     if (existing) {
//       // Race condition guard: account got created in the meantime.
//       return existing;
//     }

//     return User.create({
//       name: record.pendingName || normalizedEmail.split("@")[0],
//       email: normalizedEmail,
//       provider: "EMAIL",
//       isVerified: true,
//       avatar: null,
//     });
//   }

//   const user = await User.findOne({ email: normalizedEmail });
//   if (!user) {
//     throw new ApiError(404, "Account no longer exists.");
//   }

//   return user;
// };

// export default { requestRegisterOtp, requestLoginOtp, verifyOtp };

// ==================== new with send otp in front end =============================

import crypto from "crypto";

import Otp from "./otp.model.js";
import User from "../users/user.model.js";
import ApiError from "../../utils/ApiError.js";
import { env } from "../../config/env.js";
import { sendOtpEmail } from "../../services/email.service.js";

const generateNumericOtp = (length) => {
  const digits = "0123456789";
  let otp = "";

  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }

  return otp;
};

const hashOtp = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

/**
 * REGISTER OTP
 */
export const requestRegisterOtp = async ({ name, email, ip, userAgent }) => {
  const existing = await User.findOne({
    email: email.toLowerCase(),
  });

  if (existing) {
    throw new ApiError(
      409,
      "An account with this email already exists. Please log in instead."
    );
  }

  return issueOtp({
    email,
    purpose: "REGISTER",
    pendingName: name,
    ip,
    userAgent,
  });
};

/**
 * LOGIN OTP
 */
export const requestLoginOtp = async ({ email, ip, userAgent }) => {
  const user = await User.findOne({
    email: email.toLowerCase(),
  });

  if (!user) {
    throw new ApiError(
      404,
      "No account found with this email. Please register first.",
    );
  }

  if (!user.isActive) {
    throw new ApiError(403, "This account has been deactivated.");
  }

  return issueOtp({
    email,
    purpose: "LOGIN",
    ip,
    userAgent,
  });
};

/**
 * CREATE OTP
 */
const issueOtp = async ({ email, purpose, pendingName, ip, userAgent }) => {
  const normalizedEmail = email.toLowerCase().trim();

  const recent = await Otp.findOne({
    email: normalizedEmail,
    purpose,
    consumed: false,
  }).sort({
    createdAt: -1,
  });

  if (recent) {
    const secondsSinceIssued = (Date.now() - recent.createdAt.getTime()) / 1000;

    if (secondsSinceIssued < env.OTP_RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(
        env.OTP_RESEND_COOLDOWN_SECONDS - secondsSinceIssued,
      );

      throw new ApiError(
        429,
        `Please wait ${wait}s before requesting another code.`,
      );
    }
  }

  const otp = generateNumericOtp(env.OTP_LENGTH);

  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

  await Otp.create({
    email: normalizedEmail,
    otpHash: hashOtp(otp),
    purpose,
    pendingName: pendingName || null,
    maxAttempts: env.OTP_MAX_ATTEMPTS,
    ip,
    userAgent,
    expiresAt,
  });

  // ------------------------------------------------
  // Email send (non-blocking)
  // ------------------------------------------------

  let emailSent = false;

  try {
    await sendOtpEmail(normalizedEmail, otp, purpose);

    emailSent = true;

    console.log("✅ OTP email sent.");
  } catch (error) {
    console.error("❌ Failed to send OTP email:", error.message);

    // Continue even if SMTP fails
  }

  return {
    email: normalizedEmail,
    expiresInSeconds: env.OTP_EXPIRY_MINUTES * 60,

    emailSent,

    // DEVELOPMENT ONLY
    otp,
  };
};

/**
 * VERIFY OTP
 */
export const verifyOtp = async ({ email, otp, purpose }) => {
  const normalizedEmail = email.toLowerCase().trim();

  const record = await Otp.findOne({
    email: normalizedEmail,
    purpose,
    consumed: false,
  }).sort({
    createdAt: -1,
  });

  if (!record) {
    throw new ApiError(
      400,
      "No active verification code found. Please request a new one.",
    );
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "This code has expired. Please request a new one.");
  }

  if (record.attempts >= record.maxAttempts) {
    throw new ApiError(
      429,
      "Too many incorrect attempts. Please request a new code.",
    );
  }

  if (hashOtp(otp) !== record.otpHash) {
    record.attempts += 1;

    await record.save();

    const remaining = record.maxAttempts - record.attempts;

    throw new ApiError(
      400,
      remaining > 0
        ? `Incorrect code. ${remaining} attempt(s) remaining.`
        : "Incorrect code. No attempts remaining, please request a new code.",
    );
  }

  record.consumed = true;

  await record.save();

  if (purpose === "REGISTER") {
    const existing = await User.findOne({
      email: normalizedEmail,
    });

    if (existing) {
      return existing;
    }

    return User.create({
      name: record.pendingName || normalizedEmail.split("@")[0],
      email: normalizedEmail,
      provider: "EMAIL",
      isVerified: true,
      avatar: null,
    });
  }

  const user = await User.findOne({
    email: normalizedEmail,
  });

  if (!user) {
    throw new ApiError(404, "Account no longer exists.");
  }

  return user;
};

export default {
  requestRegisterOtp,
  requestLoginOtp,
  verifyOtp,
};
