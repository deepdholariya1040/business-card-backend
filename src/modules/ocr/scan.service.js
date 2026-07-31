import axios from "axios";
import fs from "fs";
import FormData from "form-data";

/**
 * =============================================================================
 * scanBusinessCard
 * =============================================================================
 *
 * Sends the (already optimized) front/back image files to the Python
 * OCR microservice and returns its response verbatim.
 *
 * IMPORTANT: This is the existing OCR/QR/barcode detection flow and
 * its behavior is intentionally left 100% unchanged as part of the
 * upload-pipeline refactor - only the *paths* passed in have changed
 * (they now point into src/uploads/temp/ instead of
 * src/uploads/originals/). Since this function only ever reads
 * whatever local file path it is given, that relocation requires no
 * change here.
 *
 * The caller (ocr.service.js) is responsible for the full lifecycle
 * of these files - creating them, and cleaning them up (or promoting
 * them to permanent storage) once this call returns. This function
 * does not delete or move anything itself.
 * =============================================================================
 */
export const scanBusinessCard = async (frontImagePath = null, backImagePath = null) => {
  const formData = new FormData();

  if (frontImagePath) {
    if (!fs.existsSync(frontImagePath)) {
      throw new Error(`Front image not found at path: ${frontImagePath}`);
    }
    formData.append("frontImage", fs.createReadStream(frontImagePath));
  }

  if (backImagePath) {
    if (!fs.existsSync(backImagePath)) {
      throw new Error(`Back image not found at path: ${backImagePath}`);
    }
    formData.append("backImage", fs.createReadStream(backImagePath));
  }

  const response = await axios.post(process.env.PYTHON_SERVICE_URL, formData, {
    headers: {
      ...formData.getHeaders(),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  return response.data;
};
