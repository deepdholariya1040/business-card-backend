import fs from "fs";
import path from "path";

import { env } from "../../config/env.js";

/**
 * Storage provider abstraction.
 *
 * The CURRENT behavior (multer disk storage writing into
 * src/uploads/originals, served via express.static at /uploads) is
 * left 100% unchanged in upload.middleware.js - this module does not
 * replace it, it just gives the rest of the codebase (and future
 * work) a single place to swap storage backends later without
 * touching controllers/services that already work.
 *
 * To migrate to S3/Cloudinary/GCS in the future:
 *   1. Implement a provider object with the same method shape below.
 *   2. Set UPLOAD_DRIVER=s3 (or cloudinary/gcs) in .env.
 *   3. Register it in `providers` below.
 * Nothing else in the app needs to change.
 */

const localProvider = {
  name: "local",

  async exists(relativePath) {
    return fs.existsSync(path.resolve(relativePath));
  },

  async delete(relativePath) {
    const absolute = path.resolve(relativePath);
    if (fs.existsSync(absolute)) {
      fs.unlinkSync(absolute);
    }
  },

  async metadata(relativePath) {
    const absolute = path.resolve(relativePath);
    if (!fs.existsSync(absolute)) return null;

    const stat = fs.statSync(absolute);
    return {
      imageName: path.basename(absolute),
      imagePath: relativePath,
      size: stat.size,
      uploadedAt: stat.birthtime,
    };
  },
};

const providers = {
  local: localProvider,
  // s3: s3Provider,          // future: implement when migrating
  // cloudinary: cloudinaryProvider,
  // gcs: gcsProvider,
};

const activeProvider = providers[env.UPLOAD_DRIVER] || localProvider;

export default activeProvider;
