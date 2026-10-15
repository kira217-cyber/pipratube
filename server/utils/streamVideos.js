import Video from "../models/Video.js";
import StreamUpload from "../models/StreamUpload.js";
import { createStreamVideo, deleteStreamVideo, getStreamVideo, renameStreamVideo, STREAM_STATUS, streamEnabled, streamUrls, tusAuthorization } from "./bunnyStream.js";
import { convertImage } from "./imageConvert.js";
import { saveLocalImage } from "./localFiles.js";
import { releaseWhenChecked } from "./moderation/flow.js";
import { jpegFrame } from "./moderation/check.js";
import { maxUploadBytes } from "./uploadSessions.js";
import { probeMedia } from "./mediaProbe.js";

// The life of a Bunny Stream upload:
//
//   1. openStreamUpload   — the uploader asks to upload; we open a video slot
//                           on Bunny and hand the browser a signed TUS ticket.
//   2. (browser → Bunny)  — the file goes straight to Bunny, resumable.
//   3. videoFromStream    — the uploader publishes: a Video is created as
//                           "processing" and tied to the slot.
//   4. syncStreamVideo    — Bunny's webhook (and a poll, as a safety net)
//                           tells us when encoding is done; the video gets
//                           its length, size, thumbnail and goes live.

const STREAM_PREFIX = "stream:";
export const streamFileName = (guid) => `${STREAM_PREFIX}${guid}`;
export const isStreamFileName = (fileName) => typeof fileName === "string" && fileName.startsWith(STREAM_PREFIX);
export const removeStreamFile = async (fileName) => {
  const guid = fileName.slice(STREAM_PREFIX.length);
  await deleteStreamVideo(guid);
  await StreamUpload.deleteOne({ guid }).catch(() => {});
};

const SITE_URL = () => (process.env.SITE_URL || "https://pipratube.com").replace(/\/$/, "");

const fail = (message, status) => Object.assign(new Error(message), { status });

export const openStreamUpload = async ({ uploader, fileName, size }) => {
  if (!streamEnabled()) throw fail("Direct uploads aren't set up", 503);
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) throw fail("Choose a video file", 400);
  const limit = maxUploadBytes();
  if (bytes > limit) throw fail(`Videos can be up to ${Math.round(limit / 1024 ** 3)} GB`, 413);

  const name = String(fileName || "video").slice(0, 200);
  const guid = await createStreamVideo(name);
  await StreamUpload.create({ guid, uploader, fileName: name, size: bytes });
  return tusAuthorization(guid);
};

export const videoFromStream = async ({ guid, uploader, fields, apply }) => {
  const slot = await StreamUpload.findOne({ guid: String(guid || "") });
  if (!slot || slot.uploader !== uploader) throw fail("This upload wasn't found — please upload the file again", 404);
  if (slot.video) throw fail("This upload is already published", 409);

  const info = await getStreamVideo(slot.guid);
  if (!info) throw fail("This upload wasn't found — please upload the file again", 404);
  if (info.status === STREAM_STATUS.uploadFailed || info.status === STREAM_STATUS.error) {
    throw fail("The upload didn't reach the server — please try again", 422);
  }

  const video = new Video({
    ...fields,
    file: { provider: "stream", streamId: slot.guid, fileName: streamFileName(slot.guid), size: slot.size, mimeType: "application/x-mpegURL" },
    status: "processing",
    processing: { stage: "encoding", percent: Math.round(info.encodeProgress || 0), originalName: slot.fileName },
  });
  apply?.(video);
  await video.save();
  slot.video = video._id;
  await slot.save();
  renameStreamVideo(slot.guid, video.title);

  // Usually live within a second or two (from the original); never make
  // the uploader wait more than a few seconds for the answer.
  await Promise.race([syncStreamVideo(video._id).catch(() => {}), new Promise((resolve) => setTimeout(resolve, 8000))]);
  return (await Video.findById(video._id)) || video;
};

// Bunny's thumbnail, kept on this server like every other image (the CDN
// may only answer requests from our own pages).
const saveBunnyThumbnail = async (url) => {
  const response = await fetch(url, { headers: { Referer: `${SITE_URL()}/` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) return null;
  const webp = await convertImage(Buffer.from(await response.arrayBuffer()), "thumbnail.jpg");
  return saveLocalImage(webp, "thumb", "image.webp");
};

// ---------- playing the original while Bunny encodes ----------
//
// Bunny keeps the file exactly as uploaded and serves it at /original the
// moment the upload ends, while its HLS encodes can take a while (or stall).
// So a video whose file browsers can play goes out at once from the
// original; when Bunny's encodes are ready it switches to them quietly.

const probeUrl = async (url) => {
  const meta = await probeMedia(url).catch(() => null);
  return meta && { ...meta, audioCodec: meta.audioCodec || "", container: meta.format };
};

// Will every browser play this file as it is?
const webPlayable = (meta) =>
  ["h264", "vp8", "vp9", "av1"].includes(meta.videoCodec) &&
  (!meta.audioCodec || ["aac", "mp3", "opus", "vorbis"].includes(meta.audioCodec)) &&
  /mp4|mov|webm|matroska/.test(meta.container);

// Puts the video out from Bunny's original. Returns false to keep waiting
// for the encodes instead (file not readable yet, or not playable as is).
const startFromOriginal = async (video, info) => {
  if (info.status < STREAM_STATUS.uploaded) return false;
  const urls = streamUrls(video.file.streamId, info);
  let meta = await probeUrl(urls.original);
  if (!meta || !(meta.duration > 0)) {
    // This server couldn't read it (e.g. no working ffmpeg). The uploader's
    // browser did play it to check it, and sent its length and size — an
    // MP4 / WebM that a browser plays is fine to serve as is.
    const browserPlayed = Boolean(video.moderation?.client?.verdict) && video.durationSeconds > 0 && /\.(mp4|m4v|webm)$/i.test(video.processing?.originalName || "");
    if (!browserPlayed) return false;
    meta = { duration: video.durationSeconds, width: video.width, height: video.height, videoCodec: "h264", container: "mp4" };
  }
  // Only a file every browser plays as is (H.264 / VP9 / AV1 in MP4, MOV or
  // WebM). Others — iPhone HEVC, AVI, WMV… — wait for Bunny's encodes.
  if (!webPlayable(meta)) return false;

  video.file.url = urls.original;
  video.file.fallbackUrl = urls.original;
  video.file.encoding = true;
  video.durationSeconds = Math.max(1, Math.round(meta.duration));
  video.width = meta.width || 0;
  video.height = meta.height || 0;
  if (!video.thumbnail?.url) {
    const at = Math.min(Math.max(1, meta.duration / 3), Math.max(0, meta.duration - 0.5));
    const frame = await jpegFrame(urls.original, at, 1280).catch(() => null);
    if (frame) video.thumbnail = (await saveLocalImage(await convertImage(frame, "thumb.jpg"), "thumb", "image.webp").catch(() => null)) || video.thumbnail;
  }
  video.processing.error = null;
  await releaseWhenChecked(video);
  return true;
};

const syncing = new Set();

// Brings one stream video up to date with Bunny. Safe to call any time.
export const syncStreamVideo = async (videoId) => {
  const key = String(videoId);
  if (syncing.has(key)) return;
  syncing.add(key);
  try {
    const video = await Video.findById(videoId);
    if (!video || video.file?.provider !== "stream") return;
    // Waiting for a playable file, or playing the original until encodes are ready.
    const waiting = video.status === "processing" && video.processing.stage !== "checking";
    const upgrading = Boolean(video.file.encoding);
    if (!waiting && !upgrading) return;

    const info = await getStreamVideo(video.file.streamId);
    if (!info) {
      if (waiting) {
        video.status = "failed";
        video.processing.stage = "failed";
        video.processing.error = "The upload is missing — please upload it again";
        await video.save();
      }
      return;
    }

    if (info.status === STREAM_STATUS.error || info.status === STREAM_STATUS.uploadFailed) {
      if (upgrading) {
        // The original keeps playing; there just won't be other qualities.
        await Video.updateOne({ _id: video._id }, { "file.encoding": false });
      } else if (waiting) {
        video.status = "failed";
        video.processing.stage = "failed";
        video.processing.error = "Bunny couldn't process this video — try another file";
        await video.save();
      }
      return;
    }

    if (info.status !== STREAM_STATUS.finished) {
      if (waiting && !video.file.url && (await startFromOriginal(video, info))) return;
      const percent = Math.round(info.encodeProgress || 0);
      if (waiting && percent !== video.processing.percent) await Video.updateOne({ _id: video._id }, { "processing.percent": percent, "processing.stage": "encoding" });
      return;
    }

    // Bunny's encodes are ready: HLS for the player, an MP4 copy for the rest.
    const urls = streamUrls(video.file.streamId, info);
    video.file.url = urls.hls;
    video.file.fallbackUrl = urls.mp4 || urls.original;
    video.file.encoding = false;
    video.file.size = info.storageSize || video.file.size;
    if (info.length > 0) video.durationSeconds = Math.max(1, Math.round(info.length));
    if (info.width) video.width = info.width;
    if (info.height) video.height = info.height;
    if (!video.thumbnail?.url) {
      video.thumbnail = (await saveBunnyThumbnail(urls.thumbnail).catch(() => null)) || { url: urls.thumbnail, fileName: null };
    }
    video.processing.error = null;
    if (waiting) await releaseWhenChecked(video);
    else await video.save();
  } finally {
    syncing.delete(key);
  }
};

// Called by Bunny's webhook with the video's guid.
export const syncStreamByGuid = async (guid) => {
  const video = await Video.findOne({ "file.streamId": String(guid || "") }).select("_id");
  if (video) await syncStreamVideo(video._id);
};

// Safety nets: poll videos still encoding (in case a webhook is missed),
// and delete slots nobody published within a day.
export const startStreamWatcher = () => {
  if (!streamEnabled()) return;
  const poll = async () => {
    const pending = await Video.find({ "file.provider": "stream", $or: [{ status: "processing" }, { "file.encoding": true }] }).select("_id").limit(50).lean();
    for (const { _id } of pending) await syncStreamVideo(_id).catch((error) => console.error("Stream sync failed:", error.message));
  };
  const sweep = async () => {
    const stale = await StreamUpload.find({ video: null, createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).limit(100);
    for (const slot of stale) {
      await deleteStreamVideo(slot.guid);
      await slot.deleteOne();
    }
  };
  setInterval(() => poll().catch(() => {}), 20 * 1000).unref();
  setInterval(() => sweep().catch(() => {}), 60 * 60 * 1000).unref();
  poll().catch(() => {});
};
