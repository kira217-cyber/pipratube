import { errorResponse } from "./response.js";
import { MAX_IMAGE_MB } from "./imageConvert.js";

// Wraps a multer middleware (e.g. upload.single("logo")) so file-size/
// file-type rejections come back as a clean 400 instead of falling
// through to the generic 500 error handler.
export const handleUpload = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return errorResponse(res, `Images can be up to ${MAX_IMAGE_MB} MB`, 413);
    }
    if (err) {
      return errorResponse(res, err.message, 400);
    }

    next();
  });
};

export default handleUpload;
