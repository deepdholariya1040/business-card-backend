import fs from "fs";
import path from "path";

/**
 * =============================================================================
 * Upload Directory Configuration
 * =============================================================================
 *
 * Single source of truth for every folder used by the image upload /
 * OCR pipeline. Every other module (multer storage, the OCR service,
 * cleanup utilities, etc.) imports these constants instead of hard
 * coding path strings, so the folder layout only ever needs to change
 * in one place.
 *
 * Folder responsibilities:
 *
 *   uploads/temp/     Scratch space ONLY. Every file multer receives
 *                      lands here first (raw upload, HEIC-converted
 *                      copy, optimized copy). Nothing in this folder
 *                      is considered permanent - it is always safe to
 *                      delete its contents, and the pipeline actively
 *                      does so as soon as a file is no longer needed.
 *
 *   uploads/front/     Permanent home for a business card's FRONT
 *                      image, once OCR has completed successfully.
 *
 *   uploads/back/      Permanent home for a business card's BACK
 *                      image, once OCR has completed successfully.
 *
 *   uploads/merged/    Reserved for a merged front+back image, IF a
 *                      future feature needs one. Nothing writes to
 *                      this folder today (the current OCR flow only
 *                      needs a merged *text* field, which lives in
 *                      MongoDB - not a merged image file). Should a
 *                      merged image ever become necessary for OCR
 *                      only, it must be created in `temp/` and
 *                      deleted immediately after use, never stored
 *                      here permanently, per the "one image = one
 *                      permanent file" rule.
 *
 *   uploads/originals/ Legacy folder from the previous implementation.
 *                      No longer written to. Left untouched on disk
 *                      (existing rows in the database still resolve
 *                      correctly, see src/utils/fileUrl.js) so nothing
 *                      already stored is lost or broken.
 * =============================================================================
 */

export const UPLOAD_ROOT = path.resolve("src/uploads");

export const TEMP_DIR = path.join(UPLOAD_ROOT, "temp");
export const FRONT_DIR = path.join(UPLOAD_ROOT, "front");
export const BACK_DIR = path.join(UPLOAD_ROOT, "back");
export const MERGED_DIR = path.join(UPLOAD_ROOT, "merged");

// Legacy folder - referenced only so old, already-stored file paths
// keep resolving; nothing new is ever written here.
export const LEGACY_ORIGINALS_DIR = path.join(UPLOAD_ROOT, "originals");

/**
 * Maps a logical "kind" of image to its permanent destination folder.
 * Used by the OCR service when it moves a processed image out of
 * temp/ into its final home.
 */
export const PERMANENT_DIR_BY_KIND = {
  front: FRONT_DIR,
  back: BACK_DIR,
};

/**
 * Creates every folder the pipeline depends on if it doesn't already
 * exist. Safe to call multiple times (e.g. once per process start,
 * or defensively before every write) - `recursive: true` makes
 * `mkdirSync` a no-op when the directory is already present.
 */
export const ensureUploadDirectories = () => {
  const allDirs = [TEMP_DIR, FRONT_DIR, BACK_DIR, MERGED_DIR];

  for (const dir of allDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
};

export default {
  UPLOAD_ROOT,
  TEMP_DIR,
  FRONT_DIR,
  BACK_DIR,
  MERGED_DIR,
  LEGACY_ORIGINALS_DIR,
  PERMANENT_DIR_BY_KIND,
  ensureUploadDirectories,
};
