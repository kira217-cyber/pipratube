import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import Video from "../models/Video.js";
import Channel from "../models/Channel.js";
import { uploadStreamToBunny, getBunnyCdnUrl } from "../config/bunnyStorage.js";
import { buildBunnyFileName } from "./files.js";
import { saveLocalImage } from "./localFiles.js";
import { releaseWhenChecked } from "./moderation/flow.js";
import { TMP_DIR } from "./uploadSessions.js";
import { probeMedia } from "./mediaProbe.js";
import { ffmpegPath } from "./ffmpegBin.js";

// Every upload becomes a web-safe MP4 (H.264 video + AAC audio) — the one
// format every browser and phone plays — the way YouTube re-encodes what it
// receives. MP4/MOV files that already use H.264 are just repackaged (fast,
// no quality loss); anything else (AVI, WMV, FLV, MPG, MKV, iPhone HEVC…) is
// converted. Then the file goes to Bunny and the video is published.

const FFMPEG = ffmpegPath();
const PRESET = process.env.FFMPEG_PRESET || "veryfast";
const CONCURRENCY = Math.max(1, Number(process.env.PROCESSING_CONCURRENCY) || 1);
const MAX_SIDE = 1920; // longest side after converting (1080p)

const run = (bin, args, onLine) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
      if (onLine) chunk.toString().split(/\r?\n/).forEach(onLine);
    });
    child.stderr.on("data", (chunk) => {
      err = (err + chunk).slice(-4000);
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim().split("\n").pop() || `${path.basename(bin)} failed (${code})`))));
  });

// Length, size (as displayed, after rotation) and codecs of a file.
export const probe = async (file) => {
  const info = await probeMedia(file, { timeoutMs: 120000 });
  if (!info) throw new Error("This file has no video track");
  return info;
};

// Already H.264 with web audio (in MP4, MOV, MKV…)? Then it only needs
// copying into an MP4 with the index at the front (+faststart) so playback
// starts straight away — no re-encoding, no quality loss.
const canRepackage = (info) =>
  info.videoCodec === "h264" &&
  ["yuv420p", "yuvj420p"].includes(info.pixelFormat) &&
  (!info.audioCodec || ["aac", "mp3"].includes(info.audioCodec));

const ffmpegWithProgress = (args, duration, onPercent) =>
  run(FFMPEG, ["-hide_banner", "-v", "error", "-progress", "pipe:1", "-nostats", ...args], (line) => {
    const match = /^out_time_(?:ms|us)=(\d+)/.exec(line);
    if (match && duration > 0) onPercent(Math.min(100, (Number(match[1]) / 1e6 / duration) * 100));
  });

const toMp4 = (source, target, info, onPercent) => {
  const common = ["-y", "-i", source, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn"];
  if (canRepackage(info)) return ffmpegWithProgress([...common, "-c", "copy", "-movflags", "+faststart", target], info.duration, onPercent);
  const scale = `scale='if(gte(iw,ih),min(${MAX_SIDE},iw),-2)':'if(gte(iw,ih),-2,min(${MAX_SIDE},ih))'`;
  return ffmpegWithProgress(
    [...common, "-vf", scale, "-c:v", "libx264", "-preset", PRESET, "-crf", "22", "-pix_fmt", "yuv420p", "-profile:v", "high", "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-movflags", "+faststart", target],
    info.duration,
    onPercent,
  );
};

const makeThumbnail = async (file, duration) => {
  const out = `${file}.thumb.jpg`;
  const at = Math.max(0, Math.min(duration * 0.1, duration - 0.5));
  await run(FFMPEG, ["-hide_banner", "-v", "error", "-y", "-ss", String(at), "-i", file, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", out]);
  const buffer = await sharp(out).webp({ quality: 82 }).toBuffer();
  await fsp.unlink(out).catch(() => {});
  return saveLocalImage(buffer, "thumb", "thumb.webp");
};

export const syncChannelCounts = async (channelId) => {
  const [videoCount, viewsAgg] = await Promise.all([
    Video.countDocuments({ channel: channelId, status: "published" }),
    Video.aggregate([{ $match: { channel: channelId } }, { $group: { _id: null, views: { $sum: "$views" } } }]),
  ]);
  await Channel.updateOne({ _id: channelId }, { videoCount, totalViews: viewsAgg[0]?.views || 0 });
};

// ---------- the job ----------

const processVideo = async (videoId) => {
  const video = await Video.findById(videoId);
  if (!video || video.status !== "processing") return;
  const source = video.processing?.source;
  const converted = path.join(TMP_DIR, `${video._id}.mp4`);

  // Progress is saved now and then (not on every ffmpeg line).
  let lastSave = 0;
  const report = (stage, percent, force = false) => {
    const now = Date.now();
    if (!force && now - lastSave < 2000) return;
    lastSave = now;
    Video.updateOne({ _id: video._id }, { "processing.stage": stage, "processing.percent": Math.round(percent) }).catch(() => {});
  };

  try {
    if (!source || !fs.existsSync(source)) throw new Error("The uploaded file is missing — please upload it again");
    report("checking", 0, true);
    const info = await probe(source);
    if (!(info.duration > 0)) throw new Error("Couldn't read the video's length");

    // 0–70%: convert / repackage, 70–100%: save to storage.
    report("converting", 1, true);
    await toMp4(source, converted, info, (p) => report("converting", p * 0.7));
    const size = (await fsp.stat(converted)).size;

    const thumbnail = video.thumbnail?.url ? null : await makeThumbnail(converted, info.duration).catch(() => null);

    report("saving", 70, true);
    const fileName = buildBunnyFileName("video", "video.mp4");
    await uploadStreamToBunny(fs.createReadStream(converted), fileName, "video/mp4", size, (p) => report("saving", 70 + p * 0.3));

    // Ready: published (or held) once the adult-content check says so.
    video.file = { provider: "storage", url: getBunnyCdnUrl(fileName), fileName, size, mimeType: "video/mp4" };
    video.durationSeconds = Math.max(1, Math.round(info.duration));
    video.width = info.width;
    video.height = info.height;
    if (thumbnail) video.thumbnail = thumbnail;
    video.processing.source = null;
    video.processing.error = null;
    await releaseWhenChecked(video);
  } catch (error) {
    console.error(`Video ${videoId} failed:`, error.message);
    await Video.updateOne({ _id: videoId }, { status: "failed", "processing.stage": "failed", "processing.error": error.message.slice(0, 300), "processing.source": null }).catch(() => {});
  } finally {
    await fsp.unlink(converted).catch(() => {});
    if (source) await fsp.unlink(source).catch(() => {});
  }
};

// A small queue, so a burst of uploads doesn't overload the server.
const queue = [];
let running = 0;
const pump = () => {
  while (running < CONCURRENCY && queue.length) {
    const id = queue.shift();
    running += 1;
    processVideo(id).finally(() => {
      running -= 1;
      pump();
    });
  }
};

export const enqueueVideo = (videoId) => {
  queue.push(String(videoId));
  pump();
};

// After a restart: carry on with videos whose upload is still on disk.
export const resumePendingVideos = async () => {
  const pending = await Video.find({ status: "processing" }).select("_id processing.source");
  for (const video of pending) {
    if (video.processing?.source && fs.existsSync(video.processing.source)) enqueueVideo(video._id);
    else await Video.updateOne({ _id: video._id }, { status: "failed", "processing.stage": "failed", "processing.error": "The upload was interrupted — please upload it again" });
  }
  if (pending.length) console.log(`Video processing: ${pending.length} pending after restart`);
};

// Probe + convert one file to a web MP4 (used by the job above; handy for
// checking a file by hand). Returns the probe info and whether it was only
// repackaged.
export const convertForWeb = async (source, target, onPercent = () => {}) => {
  const info = await probe(source);
  await toMp4(source, target, info, onPercent);
  return { ...info, repackaged: canRepackage(info) };
};
