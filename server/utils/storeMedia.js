import { uploadToBunny } from "../config/bunnyStorage.js";
import { buildBunnyFileName } from "./files.js";
import { setUploadProgress } from "./uploadProgress.js";

// Fallback for a video part that arrived buffered (the browser didn't send
// ?videoBytes=…): push it to the CDN now, reporting progress if asked.
export const storeMediaFile = async (file, prefix, uploadId) => {
  const fileName = buildBunnyFileName(prefix, file.originalname);
  const url = await uploadToBunny(
    file.buffer,
    fileName,
    file.mimetype,
    uploadId ? (percent) => setUploadProgress(uploadId, percent) : undefined,
  );
  return { url, fileName };
};

export default storeMediaFile;
