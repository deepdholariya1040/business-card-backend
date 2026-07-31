import BusinessCard from "./businessCard.model.js";

import ApiError from "../../utils/ApiError.js";

const INTERNAL_DYNAMIC_FIELD_KEYS = [
  "uncategorizedText",
  "rawText",
  "rawOCR",
  "provider",
  "confidence",
  "ocrProvider",
  "frontOCRText",
  "backOCRText",
  "mergedOCRText",
];

export function sanitizeBusinessCard(card) {
  if (!card) return card;

  const businessCard =
    typeof card.toObject === "function"
      ? card.toObject()
      : { ...card };

  // Remove internal dynamic fields
  if (
    businessCard.dynamicFields &&
    typeof businessCard.dynamicFields === "object"
  ) {
    INTERNAL_DYNAMIC_FIELD_KEYS.forEach((key) => {
      delete businessCard.dynamicFields[key];
    });
  }

  // Hide internal OCR metadata
  delete businessCard.frontOCRText;
  delete businessCard.backOCRText;
  delete businessCard.mergedOCRText;
  delete businessCard.rawOCR;
  delete businessCard.ocrProvider;

  // Hide duplicate arrays
  delete businessCard.phones;
  delete businessCard.emails;
  delete businessCard.websites;

  // Hide internal system fields
  delete businessCard.tenantId;
  delete businessCard.companyId;
  delete businessCard.createdBy;
  delete businessCard.isDeleted;
  delete businessCard.deletedAt;

  return businessCard;
}

export const getBusinessCards = async (filter = {}) => {
  return BusinessCard.find(filter)
    .sort({ createdAt: -1 })
    .populate("createdBy", "name email");
};

export const getBusinessCardById = async (id) => {
  return BusinessCard.findById(id).populate(
    "createdBy",
    "name email"
  );
};

export const updateBusinessCard = async (id, payload) => {

  if (payload.parsedData?.email) {
    if (!validator.isEmail(payload.parsedData.email)) {
      throw new ApiError(400, "Invalid email address.");
    }
  }

  if (payload.parsedData?.website) {
    if (
      !validator.isURL(payload.parsedData.website, {
        require_protocol: false,
      })
    ) {
      throw new ApiError(400, "Invalid website.");
    }
  }

  if (payload.parsedData?.phones) {
    const phones = payload.parsedData.phones
      .map((p) => p.trim())
      .filter(Boolean);

    const unique = [...new Set(phones)];

    if (phones.length !== unique.length) {
      throw new ApiError(
        400,
        "Duplicate phone numbers are not allowed."
      );
    }

    payload.parsedData.phones = unique;
  }

  if (payload.dynamicFields) {
    for (const [key, value] of Object.entries(payload.dynamicFields)) {
      if (!key.trim() || !String(value).trim()) {
        throw new ApiError(
          400,
          "Additional field key and value are required."
        );
      }
    }
  }

  return BusinessCard.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
};

export const deleteBusinessCard = async (id) => {
  return BusinessCard.findByIdAndDelete(id);
};