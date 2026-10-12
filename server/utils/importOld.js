import crypto from "crypto";
import bcrypt from "bcryptjs";
import sharp from "sharp";

import User from "../models/User.js";
import Channel from "../models/Channel.js";
import Video, { VIDEO_CATEGORIES } from "../models/Video.js";
import { getPipraChannel } from "../models/Site.js";
import { saveLocalImage } from "./localFiles.js";

// One-time copy of the current pipratv.com videos into the new database,
// under an official "PipraTV" channel. The old site is only READ:
//
//   • video files already live on the Bunny CDN, so the new video just
//     points at the same URL — and keeps fileName empty, so deleting it
//     in the new system can never delete the old site's file;
//   • thumbnails (2–3 MB PNGs on a slow server) are shrunk to WebP and
//     stored in the new Bunny folder.
//
// It finishes by putting the imported videos on PipraTV's own Live TV
// channel loop (if that loop is still empty).

const OFFICIAL_EMAIL = "official@pipratv.com";
const legacy = () => (process.env.LEGACY_API_URL || "https://api.pipratv.com").replace(/\/$/, "");

export const job = { running: false, total: 0, done: 0, added: 0, skipped: 0, failed: 0, error: null, finishedAt: null, account: null };

const CATEGORY_MAP = { Animation: "Kids", Educational: "Education" };

// "2h 21m 23s", "43m 54s", "1:02:18", "12:35" → seconds
export const parseDuration = (text) => {
  const value = String(text || "").trim();
  const units = value.match(/(\d+)\s*h/i) || value.match(/(\d+)\s*m/i) || value.match(/(\d+)\s*s/i);
  if (units) {
    const h = Number(value.match(/(\d+)\s*h/i)?.[1] || 0);
    const m = Number(value.match(/(\d+)\s*m(?!s)/i)?.[1] || 0);
    const s = Number(value.match(/(\d+)\s*s/i)?.[1] || 0);
    return h * 3600 + m * 60 + s;
  }
  const parts = value.split(":").map(Number);
  if (parts.every(Number.isFinite) && parts.length >= 2) return parts.reduce((sum, n) => sum * 60 + n, 0);
  return 0;
};

export const fetchJson = async (path) => {
  const response = await fetch(`${legacy()}${path}`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Old site answered ${response.status}`);
  return (await response.json()).data;
};

// Downloads an old /uploads image and stores a resized WebP on Bunny.
export const copyImage = async (path, prefix, width) => {
  if (!path) return {};
  const response = await fetch(`${legacy()}${path}`, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!response.ok) return {};
  const input = Buffer.from(await response.arrayBuffer());
  const output = await sharp(input).resize({ width, height: width, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  return saveLocalImage(output, prefix, "image.webp");
};

const officialChannel = async () => {
  let user = await User.findOne({ email: OFFICIAL_EMAIL });
  let password = null;
  if (!user) {
    password = crypto.randomBytes(9).toString("base64url");
    user = await User.create({ name: "Pipra TV", email: OFFICIAL_EMAIL, password: await bcrypt.hash(password, 10) });
  }
  let channel = await Channel.findOne({ owner: user._id });
  if (!channel) {
    let avatar = {};
    try {
      const settings = await fetchJson("/api/site/settings");
      avatar = await copyImage(settings?.logo, "channel-avatar", 512);
    } catch {
      // A channel without a picture is fine; it can be added later.
    }
    channel = await Channel.create({
      owner: user._id,
      name: "Pipra TV",
      handle: "pipratv",
      verified: true,
      avatar,
      category: "Entertainment",
      description: "সবার জন্য বিনোদন! নতুন সিনেমা, নাটক, কার্টুন, খেলা এবং আরও অনেক কিছু — সব একসাথে PipraTV তে।",
    });
  }
  return { user, channel, password };
};

export const runImport = async () => {
  if (job.running) return;
  Object.assign(job, { running: true, total: 0, done: 0, added: 0, skipped: 0, failed: 0, error: null, finishedAt: null, account: null });
  try {
    const { user, channel, password } = await officialChannel();
    if (password) job.account = { email: OFFICIAL_EMAIL, password };

    const first = await fetchJson("/api/site/videos?limit=100&page=1");
    const old = [...(first.videos || [])];
    for (let page = 2; page <= (first.totalPages || 1); page += 1) {
      old.push(...((await fetchJson(`/api/site/videos?limit=100&page=${page}`)).videos || []));
    }
    job.total = old.length;

    const existing = new Set((await Video.find({ "file.url": { $in: old.map((v) => v.video?.url).filter(Boolean) } }).select("file.url")).map((v) => v.file.url));
    const now = Date.now();
    const imported = [];

    const queue = old.map((video, index) => ({ video, index }));
    const worker = async () => {
      while (queue.length) {
        const { video: source, index } = queue.shift();
        try {
          if (!source.video?.url || existing.has(source.video.url)) {
            job.skipped += 1;
            continue;
          }
          const durationSeconds = parseDuration(source.duration);
          if (!durationSeconds) {
            job.failed += 1;
            continue;
          }
          const thumbnail = await copyImage(source.thumbnail?.landscape || source.thumbnail?.portrait, "thumb", 1280).catch(() => ({}));
          const category = CATEGORY_MAP[source.category] || (VIDEO_CATEGORIES.includes(source.category) ? source.category : "Other");
          const video = await Video.create({
            channel: channel._id,
            owner: user._id,
            title: String(source.title || "Untitled").slice(0, 120),
            description: String(source.description || "").slice(0, 5000),
            category,
            tags: ["PipraTV", category],
            thumbnail,
            // fileName left empty on purpose: never delete the old site's file.
            file: { provider: "storage", url: source.video.url, fileName: null },
            durationSeconds,
            width: 1920,
            height: 1080,
            // Keep the old site's order (its list is newest first).
            publishedAt: new Date(now - index * 60 * 60 * 1000),
          });
          imported.push({ id: video._id, index });
          job.added += 1;
        } catch {
          job.failed += 1;
        } finally {
          job.done += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));

    const [videoCount, views] = await Promise.all([Video.countDocuments({ channel: channel._id, status: "published" }), Promise.resolve(0)]);
    await Channel.updateOne({ _id: channel._id }, { videoCount, totalViews: views });

    // Fill PipraTV's own Live TV channel if it has nothing to play yet.
    const pipra = await getPipraChannel();
    if (!pipra.loop.length) {
      const longOnes = await Video.find({ channel: channel._id, status: "published", isShort: false }).sort({ publishedAt: -1 }).select("_id");
      pipra.loop = longOnes.map((v) => v._id);
      if (!pipra.logo?.url && channel.avatar?.url) pipra.logo = { url: channel.avatar.url, fileName: null };
      if (!pipra.categories.length) pipra.categories = ["bangladeshi", "entertainment"];
      await pipra.save();
    }
  } catch (error) {
    job.error = error.message;
  } finally {
    job.running = false;
    job.finishedAt = new Date();
  }
};
