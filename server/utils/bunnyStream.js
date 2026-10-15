import crypto from "node:crypto";

// Bunny Stream: uploads go from the browser straight to Bunny (TUS,
// resumable) — not a byte passes through this server — and Bunny converts
// them to adaptive HLS (240p…1080p) plus MP4 copies, makes a thumbnail and
// serves everything from its CDN. This file is the thin client for its API.
//
//   BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY, BUNNY_STREAM_CDN_HOSTNAME
//
// Docs: https://docs.bunny.net/reference/video_createvideo

const env = () => ({
  library: process.env.BUNNY_STREAM_LIBRARY_ID,
  key: process.env.BUNNY_STREAM_API_KEY,
  cdn: (process.env.BUNNY_STREAM_CDN_HOSTNAME || "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
});

export const streamEnabled = () => {
  const { library, key, cdn } = env();
  return Boolean(library && key && cdn);
};

export const TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";

// What Bunny's video "status" means.
export const STREAM_STATUS = { created: 0, uploaded: 1, processing: 2, transcoding: 3, finished: 4, error: 5, uploadFailed: 6 };

const call = async (path, { method = "GET", body } = {}) => {
  const { library, key } = env();
  const response = await fetch(`https://video.bunnycdn.com/library/${library}${path}`, {
    method,
    headers: { AccessKey: key, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Bunny Stream ${method} ${path} failed (${response.status})`);
  const text = await response.text();
  return text ? JSON.parse(text) : {};
};

export const createStreamVideo = async (title) => {
  const video = await call("/videos", { method: "POST", body: { title: String(title || "Video").slice(0, 200) } });
  if (!video?.guid) throw new Error("Bunny Stream didn't create the video");
  return video.guid;
};

// Renames the video in the Bunny dashboard (it starts with the file name).
export const renameStreamVideo = (guid, title) =>
  call(`/videos/${encodeURIComponent(guid)}`, { method: "POST", body: { title: String(title || "").slice(0, 200) } }).catch(() => null);

export const getStreamVideo = (guid) => call(`/videos/${encodeURIComponent(guid)}`);

export const deleteStreamVideo = async (guid) => {
  await call(`/videos/${encodeURIComponent(guid)}`, { method: "DELETE" }).catch(() => null);
};

// Lets one browser upload one file to one video, until `expires`. The API
// key itself never leaves this server: the browser gets only this hash.
export const tusAuthorization = (guid, ttlSeconds = 24 * 60 * 60) => {
  const { library, key } = env();
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = crypto.createHash("sha256").update(`${library}${key}${expires}${guid}`).digest("hex");
  return { endpoint: TUS_ENDPOINT, libraryId: String(library), videoId: guid, expires, signature };
};

// Where a finished video lives on the CDN.
export const streamUrls = (guid, info = {}) => {
  const { cdn } = env();
  const base = `https://${cdn}/${guid}`;
  const heights = String(info.availableResolutions || "")
    .split(",")
    .map((r) => parseInt(r, 10))
    .filter((h) => h > 0)
    .sort((a, b) => b - a);
  // MP4 copies (Library → Encoding → "MP4 fallback") go up to 720p.
  const mp4Height = info.hasMP4Fallback ? heights.find((h) => h <= 720) : null;
  return {
    hls: `${base}/playlist.m3u8`,
    mp4: mp4Height ? `${base}/play_${mp4Height}p.mp4` : null,
    thumbnail: `${base}/${info.thumbnailFileName || "thumbnail.jpg"}`,
    // The file exactly as uploaded — available as soon as the upload ends.
    original: `${base}/original`,
  };
};
