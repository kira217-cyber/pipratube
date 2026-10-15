import multer from "multer";

import { bunnyStreamStorage } from "./bunnyStreamStorage.js";
import { deleteFromBunny } from "./bunnyStorage.js";
import { LOCAL_PREFIX, removeLocal, saveLocalImage } from "../utils/localFiles.js";
import { convertImage, MAX_IMAGE_MB } from "../utils/imageConvert.js";
import { isStreamFileName, removeStreamFile } from "../utils/streamVideos.js";
import { isAdultImage } from "../utils/moderation/check.js";

const VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
  "video/3gpp",
];

// Pictures of any format up to 100 MB (MAX_IMAGE_MB) — they are converted
// to WebP when saved, so the type is checked by actually reading the file.
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
const maxVideoBytes = () => (Number(process.env.BUNNY_MAX_VIDEO_SIZE_MB) || 2048) * 1024 * 1024;

const filter = (req, file, cb) => {
  if (file.fieldname === "video") {
    return VIDEO_TYPES.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Video must be MP4, WEBM, MOV, MKV, AVI or 3GP"));
  }
  return cb(null, true);
};

// Video uploads: the video part streams straight to Bunny as it arrives
// (when the browser sends ?videoBytes=…), the thumbnail is kept in memory.
export const videoUpload = multer({
  storage: bunnyStreamStorage,
  fileFilter: filter,
  limits: { fileSize: maxVideoBytes() },
}).fields([
  { name: "video", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
  // Pictures of frames the browser's adult-content check flagged.
  { name: "flagFrames", maxCount: 4 },
]);

// Avatar / banner / thumbnail-only edits.
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: filter,
  limits: { fileSize: MAX_IMAGE_BYTES },
});

// Images are converted to WebP and saved on this server (uploads/images);
// returns { url, fileName }.
// `screen`: a picture a viewer will see (thumbnail, avatar, banner) is
// refused when it's pornographic. Admins' uploads aren't screened.
export const ADULT_IMAGE_MESSAGE = "This picture looks like adult content, which isn't allowed on PipraTube — please choose another one";
export const storeImage = async (file, prefix, { screen = false } = {}) => {
  const webp = await convertImage(file.buffer, file.originalname);
  if (screen && (await isAdultImage(webp))) throw Object.assign(new Error(ADULT_IMAGE_MESSAGE), { status: 400 });
  return saveLocalImage(webp, prefix, "image.webp");
};

// Local files are removed from disk, Bunny Stream videos through its API,
// anything else is a video on Bunny Storage.
export const removeStored = (fileName) => {
  if (!fileName) return Promise.resolve();
  if (isStreamFileName(fileName)) return removeStreamFile(fileName);
  return fileName.startsWith(LOCAL_PREFIX) ? removeLocal(fileName) : deleteFromBunny(fileName);
};
