import mongoose from "mongoose";
import { ROLES } from "../../config/roles.js";

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      default: null
    },

    // Authentication provider. Defaults to GOOGLE so every existing
    // user (who could previously only ever sign in with Google)
    // keeps working exactly as before with no data migration needed.
    provider: {
      type: String,
      enum: ["GOOGLE", "EMAIL"],
      default: "GOOGLE"
    },

    // Existing Google-authenticated users are treated as verified
    // by default (they proved ownership of the email via OAuth).
    // New Email-OTP accounts start unverified until OTP is confirmed.
    isVerified: {
      type: Boolean,
      default: true
    },

    // Populated once a refresh token is issued (Google or Email OTP
    // login). This field already existed conceptually (auth.service
    // reads/writes it) but was missing from the schema.
    refreshToken: {
      type: String,
      default: null,
      select: false
    },

    lastLoginAt: {
      type: Date,
      default: null
    },

    lastLoginIp: {
      type: String,
      default: null
    },

    lastLoginDevice: {
      type: String,
      default: null
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    avatar: {
      type: String,
      default: null
    },

    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.NORMAL_USER
    },

    previousRole: {
      type: String,
      enum: Object.values(ROLES),
      default: null
    },

    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null
    },

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    canManageStaff: {
      type: Boolean,
      default: false
    },

    scanLimits: {
      daily: {
        type: Number,
        default: 25
      },

      monthly: {
        type: Number,
        default: 500
      },

      yearly: {
        type: Number,
        default: 5000
      }
    },

    customLimits: {
      enabled: {
        type: Boolean,
        default: false
      },

      daily: {
        type: Number,
        default: 0
      },

      monthly: {
        type: Number,
        default: 0
      },

      yearly: {
        type: Number,
        default: 0
      }
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

userSchema.index({ companyId: 1, role: 1 });
userSchema.index({ tenantId: 1 });
userSchema.index({ provider: 1 });

const User = mongoose.model(
  "User",
  userSchema
);

export default User;