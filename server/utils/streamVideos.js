import Video from "../models/Video.js";
import Channel from "../models/Channel.js";
import StreamUpload from "../models/StreamUpload.js";
import { createStreamVideo, deleteStreamVideo, getStreamVideo, renameStreamVideo, STREAM_STATUS, streamEnabled, streamUrls, tusAuthorization } from "./bunnyStream.js";
import { convertImage } from "./imageConvert.js";
import { saveLocalImage } from "./localFiles.js";
import { notifySubscribers } from "./notify.js";
import { syncChannelCounts } from "./videoPipeline.js";
import { maxUploadBytes } from "./uploadSessions.js";

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

  // Tiny files can already be done.
  syncStreamVideo(video._id).catch(() => {});
  return video;
};

// Bunny's thumbnail, kept on this server like every other image (the CDN
// may only answer requests from our own pages).
const saveBunnyThumbnail = async (url) => {
  const response = await fetch(url, { headers: { Referer: `${SITE_URL()}/` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) return null;
  const webp = await convertImage(Buffer.from(await response.arrayBuffer()), "thumbnail.jpg");
  return saveLocalImage(webp, "thumb", "image.webp");
};

const syncing = new Set();

// Brings one stream video up to date with Bunny. Safe to call any time.
export const syncStreamVideo = async (videoId) => {
  const key = String(videoId);
  if (syncing.has(key)) return;
  syncing.add(key);
  try {
    const video = await Video.findById(videoId);
    if (!video || video.file?.provider !== "stream" || video.status !== "processing") return;
    const info = await getStreamVideo(video.file.streamId);
    if (!info) {
      video.status = "failed";
      video.processing.stage = "failed";
      video.processing.error = "The upload is missing — please upload it again";
      await video.save();
      return;
    }

    if (info.status === STREAM_STATUS.error || info.status === STREAM_STATUS.uploadFailed) {
      video.status = "failed";
      video.processing.stage = "failed";
      video.processing.error = "Bunny couldn't process this video — try another file";
      await video.save();
      return;
    }

    if (info.status !== STREAM_STATUS.finished) {
      const percent = Math.round(info.encodeProgress || 0);
      if (percent !== video.processing.percent) await Video.updateOne({ _id: video._id }, { "processing.percent": percent, "processing.stage": "encoding" });
      return;
    }

    // Finished — publish it.
    const urls = streamUrls(video.file.streamId, info);
    const wasScheduled = video.publishedAt > new Date();
    video.file.url = urls.hls;
    video.file.fallbackUrl = urls.mp4;
    video.file.size = info.storageSize || video.file.size;
    video.durationSeconds = Math.max(1, Math.round(info.length || 0));
    video.width = info.width || 0;
    video.height = info.height || 0;
    if (!video.thumbnail?.url) {
      video.thumbnail = (await saveBunnyThumbnail(urls.thumbnail).catch(() => null)) || { url: urls.thumbnail, fileName: null };
    }
    if (!wasScheduled) video.publishedAt = new Date();
    video.status = "published";
    video.processing.stage = "done";
    video.processing.percent = 100;
    video.processing.error = null;
    await video.save();
    await syncChannelCounts(video.channel);

    if (video.visibility === "public" && !wasScheduled) {
      const channel = await Channel.findById(video.channel);
      if (channel) notifySubscribers(channel, video);
    }
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
    const pending = await Video.find({ status: "processing", "file.provider": "stream" }).select("_id").limit(50).lean();
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
