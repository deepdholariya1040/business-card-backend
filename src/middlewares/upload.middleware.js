import fs from "fs";
import path from "path";

import multer from "multer";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { fileTypeFromFile } from "file-type";
import { v4 as uuidv4 } from "uuid";

import {
  TEMP_DIR,
  PERMANENT_DIR_BY_KIND,
  ensureUploadDirectories,
} from "../config/uploadPaths.js";

/**
 * =============================================================================
 * Upload Middleware
 * =============================================================================
 *
 * Responsibilities of this module:
 *
 *   1. Multer disk storage - EVERY uploaded file lands in
 *      `src/uploads/temp/` and nowhere else. This folder is treated
 *      as pure scratch space by the rest of the pipeline.
 *
 *   2. `optimizeImage()` - validates / converts (HEIC -> JPEG) /
 *      resizes / compresses an uploaded file. Operates entirely
 *      inside temp/, cleaning up intermediate temp files as it goes
 *      so nothing orphaned is left behind mid-pipeline. OCR logic
 *      itself is untouched - this function only prepares the image
 *      file that gets handed to OCR.
 *
 *   3. `moveToPermanentStorage()` - called ONLY after OCR succeeds.
 *      Moves the final optimized image out of temp/ into its
 *      permanent home (front/ or back/) so that a file exists in
 *      exactly one permanent location, one time.
 *
 *   4. `safeDeleteFile()` / `safeDeleteFiles()` - defensive, idempotent
 *      cleanup helpers used to guarantee temp files never survive a
 *      request, whether it succeeded or failed.
 *
 * All directories are created automatically on module load, and all
 * file operations are written to behave correctly on both Windows and
 * Linux (no shell-outs, no assumptions about path separators, cross
 * device-safe moves).
 * =============================================================================
 */

// Make sure temp/front/back/merged all exist before anything tries to
// write into them.
ensureUploadDirectories();

// -----------------------------------------------------------------------
// Multer configuration - writes to TEMP ONLY
// -----------------------------------------------------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },

  filename: (req, file, cb) => {
    // A random UUID keeps filenames unique/unguessable and avoids any
    // collision or path-traversal risk from the client-supplied
    // original filename. The extension is preserved (lower-cased) so
    // format-specific logic downstream (HEIC detection, etc.) keeps
    // working exactly as before.
    cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const allowedExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".tiff",
  ".tif",
  ".heic",
  ".heif",
  ".avif",
];

const upload = multer({
  storage,

  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },

  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      return cb(new Error("Unsupported file type."), false);
    }

    cb(null, true);
  },
});

// -----------------------------------------------------------------------
// safeDeleteFile / safeDeleteFiles
// -----------------------------------------------------------------------

/**
 * Deletes a file if it exists, and never throws. Used everywhere in
 * the pipeline that a temp file needs to be cleaned up - including
 * error paths - so a failed delete (file already gone, permissions
 * hiccup, etc.) never masks the real error or crashes the request.
 */
export const safeDeleteFile = (filePath) => {
  if (!filePath) return;

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    // Deliberately swallowed: cleanup failures must never break the
    // request/response cycle. Surface it for observability only.
    // eslint-disable-next-line no-console
    console.error(`[upload.middleware] Failed to delete temp file: ${filePath}`, err.message);
  }
};

/**
 * Convenience wrapper for deleting several (possibly null/undefined)
 * paths at once, e.g. all temp files created during one request.
 */
export const safeDeleteFiles = (filePaths = []) => {
  filePaths.filter(Boolean).forEach(safeDeleteFile);
};

// -----------------------------------------------------------------------
// optimizeImage - validate / convert / compress, entirely inside temp/
// -----------------------------------------------------------------------

/**
 * Takes the path to a just-uploaded temp file and returns the path to
 * a validated, web-optimized JPEG - also inside temp/. Every
 * intermediate file created along the way (the HEIC-converted copy,
 * the original pre-optimization upload) is deleted as soon as it is
 * no longer needed, so at most one file per image sits in temp/ at
 * any given moment.
 *
 * NOTE: OCR logic itself is untouched. This function only prepares
 * the file OCR will read - it does not call OCR and does not decide
 * where the file will permanently live.
 */
export const optimizeImage = async (filePath) => {
  const extension = path.extname(filePath).toLowerCase();

  let inputPath = filePath;

  // --- HEIC / HEIF conversion -------------------------------------------
  if (extension === ".heic" || extension === ".heif") {
    const inputBuffer = fs.readFileSync(filePath);

    const outputBuffer = await heicConvert({
      buffer: inputBuffer,
      format: "JPEG",
      quality: 1,
    });

    const jpegPath = filePath.replace(extension, ".jpg");

    fs.writeFileSync(jpegPath, outputBuffer);

    // The raw HEIC upload is no longer needed once converted -
    // delete it immediately rather than letting it linger in temp/.
    safeDeleteFile(filePath);

    inputPath = jpegPath;
  }

  // --- Resize / compress ---------------------------------------------
  const outputPath = inputPath.replace(path.extname(inputPath), "-optimized.jpg");

  await sharp(inputPath)
    .resize({
      width: 1500,
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 80,
    })
    .toFile(outputPath);

  // The pre-optimization copy (original upload, or the HEIC-converted
  // JPEG) has now been fully superseded by outputPath - remove it so
  // temp/ never holds two copies of the same image.
  if (inputPath !== outputPath) {
    safeDeleteFile(inputPath);
  }

  // --- Validate ---------------------------------------------------------
  const detectedType = await fileTypeFromFile(outputPath);

  if (!detectedType || !detectedType.mime.startsWith("image/")) {
    // Validation failed - clean up the bad output before throwing so
    // it doesn't get left behind as an orphan.
    safeDeleteFile(outputPath);
    throw new Error("Invalid image file.");
  }

  return outputPath;
};

// -----------------------------------------------------------------------
// moveToPermanentStorage - the ONLY place a file leaves temp/ for good
// -----------------------------------------------------------------------

/**
 * Moves a fully-processed temp file into its permanent folder
 * (front/ or back/). This must only be called after OCR has
 * succeeded - it is what turns a temporary, disposable file into the
 * single permanent copy of that image.
 *
 * Uses fs.renameSync for an atomic move when possible, and falls back
 * to copy-then-delete if the temp and destination folders happen to
 * live on different filesystems/devices (renameSync throws EXDEV in
 * that case - this can happen with certain Docker volume mounts).
 * This makes the move safe on both Windows and Linux regardless of
 * deployment topology.
 *
 * Returns BOTH:
 *   - `absolutePath`: the real, OS-resolved filesystem path. This is
 *     only for internal use within this request (e.g. deleting the
 *     file again if a later step fails and the write must be rolled
 *     back) - it must NEVER be persisted to the database, since an
 *     absolute path baked in on one machine/container (e.g.
 *     "C:\Users\hp\...\src\uploads\front\x.jpg" or
 *     "/app/src/uploads/front/x.jpg") will not exist at that same
 *     location on a different machine, a redeployed container, or a
 *     different developer's laptop.
 *   - `relativePath`: a short, portable, storage-driver-agnostic path
 *     of the form "front/<filename>" or "back/<filename>" (always
 *     forward slashes, regardless of OS). THIS is what callers must
 *     persist to MongoDB - it is stable across environments
 *     (localhost, Docker, Render, Railway, AWS, ...) because it never
 *     encodes a machine-specific filesystem root, and it is exactly
 *     what `buildImageUrl()` (src/utils/fileUrl.js) expects in order
 *     to build a correct public URL on every request.
 *
 * @param {string} tempFilePath - absolute path to the optimized file in temp/
 * @param {"front" | "back"} kind - which permanent folder to move it into
 * @returns {{ absolutePath: string, relativePath: string }}
 */
export const moveToPermanentStorage = (tempFilePath, kind) => {
  const destinationDir = PERMANENT_DIR_BY_KIND[kind];

  if (!destinationDir) {
    throw new Error(`moveToPermanentStorage: unknown kind "${kind}". Expected "front" or "back".`);
  }

  const filename = path.basename(tempFilePath);
  const destinationPath = path.join(destinationDir, filename);

  try {
    fs.renameSync(tempFilePath, destinationPath);
  } catch (err) {
    if (err.code === "EXDEV") {
      // Cross-device move (different filesystem/volume) - rename()
      // can't do this atomically, so copy the bytes over and then
      // remove the temp source ourselves.
      fs.copyFileSync(tempFilePath, destinationPath);
      safeDeleteFile(tempFilePath);
    } else {
      throw err;
    }
  }

  // Portable, DB-safe path - always forward slashes, always just
  // "<kind>/<filename>", regardless of what OS or absolute root this
  // process happens to be running under.
  const relativePath = `${kind}/${filename}`;

  return { absolutePath: destinationPath, relativePath };
};

export default upload;
