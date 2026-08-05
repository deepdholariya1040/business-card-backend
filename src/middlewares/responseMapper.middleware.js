import { buildImageUrl } from "../utils/fileUrl.js";

// const SENSITIVE_KEYS = new Set([
//   "refreshToken",
//   "otpHash",
//   "otp",
//   "__v",
// ]);

const SENSITIVE_KEYS = new Set([
  "refreshToken",
  "otpHash",
  "__v",
]);

/**
 * Returns true only for plain JavaScript objects.
 * Prevents recursion into BSON/Mongoose special types.
 */
const isPlainObject = (value) => {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

/**
 * Safely maps response values while preserving MongoDB/BSON types.
 */
const mapValue = (req, value) => {
  // null / primitive
  if (value == null || typeof value !== "object") {
    return value;
  }

  // Array
  if (Array.isArray(value)) {
    return value.map((item) => mapValue(req, item));
  }

  // Date
  if (value instanceof Date) {
    return value;
  }

  // Buffer
  if (Buffer.isBuffer(value)) {
    return value;
  }

  /**
   * MongoDB / BSON ObjectId
   * Preserve as string instead of recursively traversing.
   */
  if (
    typeof value.toHexString === "function" &&
    typeof value.equals === "function"
  ) {
    return value.toHexString();
  }

  /**
   * Mongoose Documents
   * Convert once to a plain object.
   */
  if (
    typeof value.toObject === "function" &&
    value.constructor?.name !== "ObjectId"
  ) {
    value = value.toObject({
      virtuals: true,
      getters: true,
    });
  }

  /**
   * Anything that exposes its own toJSON() (custom value types from
   * third-party libraries, etc.) should keep that serialization
   * instead of being walked field-by-field.
   *
   * NOTE: this is intentionally checked *before* the plain-object
   * gate below, and the plain-object gate is no longer used to skip
   * traversal entirely. Every BSON/Date/Buffer/Mongoose-document case
   * that needs special handling has already been handled above this
   * point, so anything that reaches here - including plain object
   * literals AND application-level data-container classes like
   * `ApiResponse` (whose prototype is not `Object.prototype`, so
   * `isPlainObject()` would say `false`) - is safe to walk with
   * `Object.entries()`. Previously, `ApiResponse` instances (the
   * actual shape passed to every `res.json(...)` call in this app)
   * were returned as-is here without ever being traversed, which
   * silently prevented `frontImageUrl`/`backImageUrl` from ever being
   * added to any business-card response.
   */
  if (!isPlainObject(value) && typeof value.toJSON === "function") {
    return value.toJSON();
  }

  const output = {};

  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      continue;
    }

    output[key] = mapValue(req, val);
  }

  /**
   * Preserve existing image URL logic.
   */
  if (value.frontImage) {
    output.frontImageUrl = buildImageUrl(req, value.frontImage);
  }

  if (value.backImage) {
    output.backImageUrl = buildImageUrl(req, value.backImage);
  }

  return output;
};

/**
 * Adds environment-aware image URLs and removes sensitive fields
 * without corrupting MongoDB ObjectIds or other BSON types.
 */
export const responseMapper = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    try {
      return originalJson(mapValue(req, body));
    } catch (err) {
      return originalJson(body);
    }
  };

  next();
};

export default responseMapper;