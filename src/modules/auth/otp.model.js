import mongoose from "mongoose";

/**
 * Stores only a hash of the OTP (never the plaintext code), plus
 * metadata needed for rate limiting, attempt limiting, and audit
 * (device/IP tracking). Documents are automatically deleted by
 * MongoDB once `expiresAt` passes, via the TTL index below - no
 * manual cleanup job required.
 */
const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    otpHash: {
      type: String,
      required: true,
    },

    purpose: {
      type: String,
      enum: ["REGISTER", "LOGIN"],
      required: true,
    },

    // Extra registration details kept only until OTP is verified,
    // so the account is created atomically on successful verification.
    pendingName: {
      type: String,
      default: null,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    maxAttempts: {
      type: Number,
      required: true,
    },

    consumed: {
      type: Boolean,
      default: false,
    },

    ip: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index: MongoDB removes the document once expiresAt is reached.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Speeds up "find latest OTP for this email+purpose" lookups.
otpSchema.index({ email: 1, purpose: 1, createdAt: -1 });

const Otp = mongoose.model("Otp", otpSchema);

export default Otp;
