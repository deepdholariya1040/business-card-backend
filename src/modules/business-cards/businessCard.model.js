import mongoose from "mongoose";

const businessCardSchema = new mongoose.Schema(
  {
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
      required: true
    },

    frontImage: {
      type: String,
      default: null
    },

    backImage: {
      type: String,
      default: null
    },

    frontOCRText: {
      type: String,
      default: ""
    },

    backOCRText: {
      type: String,
      default: ""
    },

    mergedOCRText: {
      type: String,
      default: ""
    },

    parsedData: {
      name: {
        type: String,
        default: ""
      },

      designation: {
        type: String,
        default: ""
      },

      company: {
        type: String,
        default: ""
      },

      email: {
        type: String,
        default: ""
      },

      phones: {
        type: [String],
        default: []
      },

      website: {
        type: String,
        default: ""
      },

      address: {
        type: String,
        default: ""
      }
    },

    // --- New, additive fields below ---
    // Existing `parsedData.phones` / `.email` / `.website` above are
    // left completely untouched for backward compatibility. These
    // top-level arrays are the new, richer representation and are
    // simply empty by default on old records until re-scanned or
    // backfilled - nothing reads/writes them unless explicitly used.

    phones: {
      type: [String],
      default: []
    },

    emails: {
      type: [String],
      default: []
    },

    websites: {
      type: [String],
      default: []
    },

    // Unlimited custom key/value or key/array fields captured from a
    // card (PAN, GST, social handles, UPI, certifications, etc.)
    dynamicFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // Raw text/data as returned by the OCR provider, kept verbatim
    // for audit/reprocessing/future-provider-migration purposes.
    rawOCR: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    // Which OCR engine produced this record, to support swapping or
    // mixing providers in the future without breaking old records.
    ocrProvider: {
      type: String,
      default: "default"
    },

    // --- QR Code / Barcode detection (newly added) ---
    // Purely additive: old records simply default to empty arrays, so
    // nothing needs to be backfilled/migrated and no existing reader
    // of this document is affected. Detection itself always happens in
    // the Python OCR microservice; Node only stores what it receives.
    qrCodes: {
      type: [
        {
          _id: false,
          type: {
            type: String,
            default: "QR_CODE"
          },
          dataType: {
            type: String,
            default: "TEXT"
          },
          content: {
            type: String,
            default: ""
          },
          raw: {
            type: String,
            default: ""
          }
        }
      ],
      default: []
    },

    barcodes: {
      type: [
        {
          _id: false,
          type: {
            type: String,
            default: "UNKNOWN"
          },
          content: {
            type: String,
            default: ""
          },
          raw: {
            type: String,
            default: ""
          }
        }
      ],
      default: []
    },

    isDeleted: {
      type: Boolean,
      default: false
    },

    deletedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    minimize: false
  }
);

businessCardSchema.index({ companyId: 1, createdAt: -1 });
businessCardSchema.index({ tenantId: 1, createdAt: -1 });
businessCardSchema.index({ createdBy: 1, createdAt: -1 });
businessCardSchema.index({ isDeleted: 1 });
businessCardSchema.index(
  { mergedOCRText: "text", "parsedData.name": "text", "parsedData.company": "text" },
  { name: "business_card_search_index" }
);

// Soft-delete aware query helpers, opt-in only (existing
// BusinessCard.find(...) calls anywhere else in the codebase keep
// their exact current behavior - nothing is auto-filtered globally).
businessCardSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, isDeleted: { $ne: true } });
};

businessCardSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

const BusinessCard = mongoose.model(
  "BusinessCard",
  businessCardSchema
);

export default BusinessCard;