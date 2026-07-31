import path from "path";

import { env } from "../config/env.js";

/**
 * =============================================================================
 * fileUrl utilities
 * =============================================================================
 *
 * Turns whatever is stored in `frontImage` / `backImage` on a
 * BusinessCard document into a working, absolute URL for the
 * frontend.
 *
 * Historical note: earlier records were stored as an absolute or
 * relative path under `src/uploads/originals/`. Since the upload
 * pipeline refactor, new records are stored under
 * `src/uploads/front/` or `src/uploads/back/` instead. Rather than
 * hard-coding one folder name (which would break either old or new
 * records), `folderFromStoredPath()` reads the folder name directly
 * out of whatever path is already stored - so both old and new
 * records resolve correctly with zero migration and zero backend
 * logic change to existing rows.
 * =============================================================================
 */

/**
 * Existing records may have `frontImage`/`backImage` stored as either
 * a bare filename, a relative path ("src/uploads/front/x.jpg"), or a
 * full OS-resolved absolute path (depending on how/where the server
 * was run when the record was created). All of that is preserved
 * exactly as stored in the database (no migration, no backend logic
 * change) - this helper only affects what URL is *returned* to the
 * frontend, computed fresh on every response.
 */
export const filenameFromStoredPath = (storedPath) => {
  if (!storedPath) return null;

  // Normalize Windows-style separators BEFORE calling path.basename().
  // path.basename() only understands the separator of the OS Node is
  // currently running on - so a Windows-written path like
  // "C:\...\front\abc.jpg" would NOT be split correctly by
  // path.basename() when this code runs on Linux (Docker/Render/etc),
  // returning the entire path as the "filename" instead of just
  // "abc.jpg". Normalizing first makes this correct on every platform
  // regardless of which OS originally wrote the stored path.
  const normalized = storedPath.replace(/\\/g, "/");
  return path.basename(normalized);
};

// Every subfolder under src/uploads/ that a stored image path could
// legitimately point into. Used to recognize the new, portable
// relative-path format ("front/<filename>") unambiguously.
const KNOWN_UPLOAD_FOLDERS = ["front", "back", "merged", "temp", "originals"];

/**
 * Determines which `/uploads/<folder>/` segment a stored path
 * belongs to. Supports two shapes of stored value, to stay backward
 * compatible with data written before this pipeline stored portable
 * relative paths:
 *
 *   1. NEW format (current): a short relative path with no
 *      machine-specific root, e.g. "front/abc-optimized.jpg" or
 *      "back/xyz-optimized.jpg" - exactly what
 *      moveToPermanentStorage() in upload.middleware.js now returns
 *      and what ocr.service.js persists to MongoDB.
 *
 *   2. LEGACY format: an absolute or partially-absolute path written
 *      by an older version of this pipeline, e.g.
 *      "C:\Users\hp\Downloads\backend-fixed\src\uploads\front\abc.jpg"
 *      (Windows) or "/app/src/uploads/originals/abc.jpg" (Linux/
 *      Docker). These are NOT rewritten in the database (no
 *      migration needed) - this function just still resolves the
 *      correct folder out of whatever was already stored, so old
 *      records keep working exactly as before.
 *
 * Handles both path separator styles (Windows "\\" and POSIX "/") so
 * this works correctly regardless of which OS wrote the record.
 */
export const folderFromStoredPath = (storedPath) => {
  if (!storedPath) return "originals";

  const normalized = storedPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);

  // New format: exactly "<folder>/<filename>", folder is a known
  // upload subfolder. Checked first since it's the current,
  // expected shape for every record created going forward.
  if (parts.length === 2 && KNOWN_UPLOAD_FOLDERS.includes(parts[0])) {
    return parts[0];
  }

  // Legacy format: pull the folder name out from wherever "uploads"
  // appears in an absolute/relative path.
  const uploadsIndex = parts.lastIndexOf("uploads");
  if (uploadsIndex !== -1 && parts[uploadsIndex + 1]) {
    return parts[uploadsIndex + 1];
  }

  // Last-resort fallback (e.g. a bare filename with no folder info
  // at all) - preserves pre-refactor behavior for any edge-case data.
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }

  return "originals";
};

/**
 * Builds an absolute, working image URL.
 * Priority:
 *  1. SERVER_URL env var, if set (recommended for production - works
 *     correctly behind Docker/Nginx/Railway/Render reverse proxies).
 *  2. Falls back to deriving origin from the incoming request
 *     (protocol + host), which correctly handles localhost, LAN IP
 *     access, and most reverse-proxy setups that forward the
 *     original Host header.
 */
export const buildImageUrl = (req, storedPath) => {
  const filename = filenameFromStoredPath(storedPath);
  if (!filename) return null;

  const folder = folderFromStoredPath(storedPath);

  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];

  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get("host");

  const base = env.SERVER_URL ? env.SERVER_URL.replace(/\/+$/, "") : `${protocol}://${host}`;

  return `${base}/uploads/${folder}/${filename}`;
};

export default { filenameFromStoredPath, folderFromStoredPath, buildImageUrl };
