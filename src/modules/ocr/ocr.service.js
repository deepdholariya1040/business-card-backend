import BusinessCard from "../business-cards/businessCard.model.js";

import { checkScanLimits } from "./limit.service.js";
import { scanBusinessCard } from "./scan.service.js";

import {
  optimizeImage,
  moveToPermanentStorage,
  safeDeleteFiles,
} from "../../middlewares/upload.middleware.js";

import { createAuditLog } from "../audit-logs/audit.service.js";

/**
 * =============================================================================
 * processOCR
 * =============================================================================
 *
 * Owns the full lifecycle of an uploaded image for a single scan
 * request:
 *
 *   1. Enforce scan limits (unchanged).
 *   2. Optimize whichever of front/back was uploaded - this happens
 *      entirely inside src/uploads/temp/ (see upload.middleware.js).
 *   3. Hand the optimized temp file(s) to the existing OCR flow
 *      (scanBusinessCard -> Python service). OCR / QR / barcode
 *      detection logic itself is NOT touched.
 *   4. Only once OCR has succeeded: move each optimized image out of
 *      temp/ into its permanent home (front/ or back/) - one image,
 *      one permanent file, no duplicates.
 *   5. Persist the BusinessCard with the permanent paths.
 *   6. In every case - success or failure, at any step - guarantee
 *      that nothing is left behind in temp/.
 *
 * If the user only uploaded a front image, only src/uploads/front/
 * ever receives a permanent file (and vice versa for back-only). If
 * both were uploaded, both permanent folders receive exactly one file
 * each. No merged image file is ever written anywhere, since the
 * existing flow only needs merged *text*, which is stored on the
 * BusinessCard document itself (mergedOCRText).
 * =============================================================================
 */
export const processOCR = async (
  user,
  frontImagePath = null,
  backImagePath = null,
) => {
  // Tracks every temp file this request has created so far, so it can
  // be wiped out on any failure path without missing anything. Paths
  // are removed from this list the moment they are safely moved to
  // permanent storage (or otherwise no longer temp-only).
  const tempFilesToCleanup = [];

  if (frontImagePath) tempFilesToCleanup.push(frontImagePath);
  if (backImagePath) tempFilesToCleanup.push(backImagePath);

  // Tracks files that have already been moved to their PERMANENT
  // folder (front/back). If something fails after the move but
  // before the BusinessCard document is actually saved, these would
  // otherwise become orphaned permanent files with no DB record
  // pointing at them - the catch block below removes them too.
  const permanentFilesToRollback = [];

  try {
    const limitResult = await checkScanLimits(user);

    if (!limitResult.allowed) {
      throw new Error("Scan limit exceeded.");
    }

    // --- Optimize (validate / convert HEIC / compress) -------------------
    // Both outputs still live in temp/ at this point.
    let optimizedFrontTemp = null;

    if (frontImagePath) {
      optimizedFrontTemp = await optimizeImage(frontImagePath);
      // The raw upload has already been deleted/superseded inside
      // optimizeImage(); track the new optimized file instead.
      tempFilesToCleanup[tempFilesToCleanup.indexOf(frontImagePath)] =
        optimizedFrontTemp;
    }

    let optimizedBackTemp = null;

    if (backImagePath) {
      optimizedBackTemp = await optimizeImage(backImagePath);
      tempFilesToCleanup[tempFilesToCleanup.indexOf(backImagePath)] =
        optimizedBackTemp;
    }

    // --- OCR (existing logic - untouched) ---------------------------------
    const result = await scanBusinessCard(
      optimizedFrontTemp,
      optimizedBackTemp,
    );

    // Python OCR payload
    const ocrPayload = result.ocr || result;

    const mergedText =
      ocrPayload.mergedOCRText ||
      [ocrPayload.frontOCRText, ocrPayload.backOCRText]
        .filter(Boolean)
        .join("\n");

    // QR / Barcode (returned by Python)
    const qrCodes = Array.isArray(result.qrCodes)
      ? result.qrCodes
      : Array.isArray(ocrPayload.qrCodes)
        ? ocrPayload.qrCodes
        : [];

    const barcodes = Array.isArray(result.barcodes)
      ? result.barcodes
      : Array.isArray(ocrPayload.barcodes)
        ? ocrPayload.barcodes
        : [];

    // Parsed data returned by Python
    const parsedData = ocrPayload.parsedData || {};

    console.log("========== PYTHON RESPONSE ==========");
    console.dir(ocrPayload, { depth: null });

    console.log("========== PARSED DATA ==========");
    console.dir(parsedData, { depth: null });

    // --- OCR succeeded: promote temp files to permanent storage -----------
    // This is the ONLY point at which a file leaves temp/ for good.
    // If anything below this point fails, the catch block still has
    // the correct final paths to clean up.
    //
    // moveToPermanentStorage() returns TWO paths:
    //   - `.absolutePath` - the real filesystem path, used ONLY for
    //     rollback deletion within this function if something later
    //     fails. Never persisted anywhere.
    //   - `.relativePath` - a short, portable path like
    //     "front/<filename>" (no machine-specific root, always
    //     forward slashes). THIS is what gets saved to MongoDB, so
    //     the stored value stays valid across environments
    //     (localhost, Docker, Render, Railway, AWS, a different
    //     developer's machine, ...) instead of baking in an
    //     absolute path that only exists on the machine that created
    //     it. buildImageUrl() (src/utils/fileUrl.js) turns this
    //     relative path into the correct public URL on every request.
    let permanentFrontRelative = null;
    let permanentFrontAbsolute = null;

    if (optimizedFrontTemp) {
      const moved = moveToPermanentStorage(optimizedFrontTemp, "front");
      permanentFrontRelative = moved.relativePath;
      permanentFrontAbsolute = moved.absolutePath;
      tempFilesToCleanup[tempFilesToCleanup.indexOf(optimizedFrontTemp)] = null;
      permanentFilesToRollback.push(permanentFrontAbsolute);
    }

    let permanentBackRelative = null;
    let permanentBackAbsolute = null;

    if (optimizedBackTemp) {
      const moved = moveToPermanentStorage(optimizedBackTemp, "back");
      permanentBackRelative = moved.relativePath;
      permanentBackAbsolute = moved.absolutePath;
      tempFilesToCleanup[tempFilesToCleanup.indexOf(optimizedBackTemp)] = null;
      permanentFilesToRollback.push(permanentBackAbsolute);
    }

    const businessCard = await BusinessCard.create({
      tenantId: user.tenantId,
      companyId: user.companyId,
      createdBy: user.id,

      // Relative paths only - see comment above. Never store
      // `permanentFrontAbsolute` / `permanentBackAbsolute` here.
      frontImage: permanentFrontRelative,
      backImage: permanentBackRelative,

      frontOCRText: ocrPayload.frontOCRText || "",
      backOCRText: ocrPayload.backOCRText || "",
      mergedOCRText: mergedText || "",

      // Save Python parser output directly
      parsedData,

      phones: parsedData.phones || [],

      emails:
        parsedData.allEmails ||
        parsedData.emails ||
        (parsedData.email ? [parsedData.email] : []),

      websites:
        parsedData.allWebsites ||
        parsedData.websites ||
        (parsedData.website ? [parsedData.website] : []),

      dynamicFields: parsedData.dynamicFields || {},

      rawOCR: result,

      ocrProvider:
        ocrPayload.provider || result.provider || "python-ocr-service",

      qrCodes,
      barcodes,
    });

    // The BusinessCard document now correctly references the
    // permanent files, so they are no longer rollback candidates -
    // even if the (non-critical) audit log write below fails.
    permanentFilesToRollback.length = 0;

    await createAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: "OCR_SCAN",
      targetId: businessCard._id,
      tenantId: user.tenantId,
      companyId: user.companyId,
    });

    return businessCard;
  } catch (err) {
    // BusinessCard.create() (or the limit/OCR/optimize steps before
    // it) failed. If files had already been moved to their permanent
    // folder before the failure, they are now orphans - no DB record
    // will ever point at them - so roll them back too.
    safeDeleteFiles(permanentFilesToRollback);
    throw err;
  } finally {
    // Whatever is STILL in this list (i.e. never reached
    // moveToPermanentStorage, or moveToPermanentStorage itself never
    // ran because an earlier step failed) is guaranteed cleaned up -
    // success or failure, this never leaves orphaned temp files.
    safeDeleteFiles(tempFilesToCleanup);
  }
};
