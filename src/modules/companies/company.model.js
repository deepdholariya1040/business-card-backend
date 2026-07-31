import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    maxCompanyAdmins: {
      type: Number,
      default: 5
    },

    maxStaff: {
      type: Number,
      default: 50
    },

    mainAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    // Company-wide scan limits
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

    // Company-wide usage tracking
    scanUsage: {
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

    subscription: {
      startDate: {
        type: Date,
        default: Date.now
      },

      expiryDate: {
        type: Date,
        required: true
      },

      isExpired: {
        type: Boolean,
        default: false
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

companySchema.index({ isActive: 1 });

const Company = mongoose.model(
  "Company",
  companySchema
);

export default Company;