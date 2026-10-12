import express from "express";
import mongoose from "mongoose";

import Video from "../models/Video.js";
import Channel from "../models/Channel.js";
import { Ad, AD_PLACEMENTS, LiveTvChannel, LiveTvOverlay, OVERLAY_KINDS, OVERLAY_POSITIONS, OVERLAY_SIZES, getHomeConfig, getPipraChannel, getSettings } from "../models/Site.js";
import { pipraNowPlaying } from "../utils/pipraChannel.js";
import { LIVE_TV_CATEGORIES, parseLiveTvCategories } from "../models/liveTvCategories.js";
import { requireAdmin } from "../middleware/auth.js";
import { imageUpload, videoUpload, storeImage, removeStored } from "../config/uploads.js";
import { discardStreamedUploadsOnFailure } from "../config/bunnyStreamStorage.js";
import { saveLocalImage } from "../utils/localFiles.js";
import { handleUpload } from "../utils/handleUpload.js";
import { storeMediaFile } from "../utils/storeMedia.js";
import { loadLiveTvSourceChannels } from "../utils/liveTvSource.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { channelSummary, publicVideo } from "../utils/serialize.js";

// Admin panel: Home curation, ads, Live TV and site settings.
const router = express.Router();
const isId = (value) => mongoose.isValidObjectId(value);
const bool = (value) => value === true || value === "true";

// ================= Home curation =================

const shapeHome = async (config) => {
  await config.populate([
    { path: "pinnedVideos", populate: { path: "channel" } },
    { path: "pinnedShorts", populate: { path: "channel" } },
    { path: "sections.videos", populate: { path: "channel" } },
    { path: "featuredChannels" },
  ]);
  const videos = (list) => list.filter((v) => v?.channel).map((v) => publicVideo(v, { owner: true }));
  return {
    pinnedVideos: videos(config.pinnedVideos),
    pinnedShorts: videos(config.pinnedShorts),
    sections: config.sections.map((s) => ({ id: s._id, title: s.title, enabled: s.enabled, videos: videos(s.videos) })),
    featuredChannels: config.featuredChannels.filter(Boolean).map(channelSummary),
    shuffleVideos: config.shuffleVideos,
    shuffleShorts: config.shuffleShorts,
    shortsEvery: config.shortsEvery,
  };
};

router.get("/home", requireAdmin("home"), async (req, res) => successResponse(res, "Home", { home: await shapeHome(await getHomeConfig()) }));

// Replace the whole curation in one go (the admin page edits it as a unit).
router.put("/home", requireAdmin("home"), async (req, res) => {
  try {
    const ids = (list) => (Array.isArray(list) ? list.filter(isId).slice(0, 50) : []);
    const config = await getHomeConfig();
    const body = req.body || {};
    if (body.pinnedVideos) config.pinnedVideos = ids(body.pinnedVideos);
    if (body.pinnedShorts) config.pinnedShorts = ids(body.pinnedShorts);
    if (body.featuredChannels) config.featuredChannels = ids(body.featuredChannels);
    for (const key of ["shuffleVideos", "shuffleShorts"]) if (body[key] !== undefined) config[key] = bool(body[key]);
    if (body.shortsEvery !== undefined) config.shortsEvery = Math.min(12, Math.max(2, Math.round(Number(body.shortsEvery)) || 4));
    if (Array.isArray(body.sections)) {
      config.sections = body.sections
        .filter((s) => String(s?.title || "").trim())
        .slice(0, 20)
        .map((s) => ({ title: String(s.title).trim().slice(0, 80), enabled: s.enabled !== false, videos: ids(s.videos) }));
    }
    await config.save();
    return successResponse(res, "Home saved", { home: await shapeHome(config) });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Video / channel pickers for the curation page.
router.get("/pick/videos", requireAdmin("home"), async (req, res) => {
  const filter = { status: "published", visibility: "public" };
  if (req.query.type === "shorts") filter.isShort = true;
  if (req.query.search?.trim()) filter.title = new RegExp(req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const videos = await Video.find(filter).sort({ publishedAt: -1 }).limit(30).populate("channel");
  return successResponse(res, "Videos", { videos: videos.map((v) => publicVideo(v)) });
});

router.get("/pick/channels", requireAdmin("home"), async (req, res) => {
  const filter = { status: "active" };
  if (req.query.search?.trim()) {
    const pattern = new RegExp(req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: pattern }, { handle: pattern }];
  }
  const channels = await Channel.find(filter).sort({ subscriberCount: -1 }).limit(30);
  return successResponse(res, "Channels", { channels: channels.map(channelSummary) });
});

// ================= Ads =================

const shapeAd = (ad) => ({
  id: ad._id,
  title: ad.title,
  kind: ad.kind,
  placement: ad.placement,
  image: ad.image?.url || null,
  video: ad.video?.url || null,
  url: ad.url,
  skipAfterSeconds: ad.skipAfterSeconds,
  firstDelaySeconds: ad.firstDelaySeconds,
  intervalSeconds: ad.intervalSeconds,
  onVideos: ad.onVideos,
  onLiveTv: ad.onLiveTv,
  enabled: ad.enabled,
  startAt: ad.startAt,
  endAt: ad.endAt,
  createdAt: ad.createdAt,
});

const applyAd = (ad, body) => {
  if (typeof body.title === "string" && body.title.trim()) ad.title = body.title.trim().slice(0, 100);
  if (AD_PLACEMENTS.includes(body.placement)) ad.placement = body.placement;
  if (typeof body.url === "string") ad.url = body.url.trim().slice(0, 500);
  for (const key of ["skipAfterSeconds", "firstDelaySeconds", "intervalSeconds"]) {
    if (body[key] !== undefined && Number.isFinite(Number(body[key]))) ad[key] = Number(body[key]);
  }
  for (const key of ["onVideos", "onLiveTv", "enabled"]) if (body[key] !== undefined) ad[key] = bool(body[key]);
  for (const key of ["startAt", "endAt"]) {
    if (body[key] !== undefined) ad[key] = body[key] ? new Date(body[key]) : null;
  }
};

router.get("/ads", requireAdmin("ads"), async (req, res) => {
  const ads = await Ad.find().sort({ createdAt: -1 });
  return successResponse(res, "Ads", { ads: ads.map(shapeAd), placements: AD_PLACEMENTS });
});

// Banner ads carry an `image`; video ads stream a `video` part like uploads.
router.post("/ads", requireAdmin("ads"), handleUpload(videoUpload), discardStreamedUploadsOnFailure, async (req, res) => {
  try {
    const kind = req.body?.kind === "video" ? "video" : "banner";
    const ad = new Ad({ kind, title: req.body?.title || "Untitled ad" });
    applyAd(ad, req.body || {});
    const image = req.files?.thumbnail?.[0];
    const video = req.files?.video?.[0];
    if (kind === "banner") {
      if (!image) return errorResponse(res, "Choose the banner image", 400);
      ad.image = await storeImage(image, "ad");
    } else {
      if (!video) return errorResponse(res, "Choose the ad video", 400);
      ad.video = video.bunnyUrl ? { url: video.bunnyUrl, fileName: video.bunnyFileName } : await storeMediaFile(video, "ad-video");
    }
    await ad.save();
    return successResponse(res, "Ad created", { ad: shapeAd(ad) }, 201);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.patch("/ads/:id", requireAdmin("ads"), handleUpload(imageUpload.single("thumbnail")), async (req, res) => {
  const ad = isId(req.params.id) ? await Ad.findById(req.params.id) : null;
  if (!ad) return errorResponse(res, "Ad not found", 404);
  applyAd(ad, req.body || {});
  if (req.file && ad.kind === "banner") {
    const previous = ad.image?.fileName;
    ad.image = await storeImage(req.file, "ad");
    removeStored(previous);
  }
  await ad.save();
  return successResponse(res, "Ad saved", { ad: shapeAd(ad) });
});

router.delete("/ads/:id", requireAdmin("ads"), async (req, res) => {
  const ad = isId(req.params.id) ? await Ad.findById(req.params.id) : null;
  if (!ad) return errorResponse(res, "Ad not found", 404);
  removeStored(ad.image?.fileName);
  removeStored(ad.video?.fileName);
  await ad.deleteOne();
  return successResponse(res, "Ad deleted");
});

// ================= Live TV overlays =================
// Logos and short image / video ads in a corner of the Live TV player.

const endOfDay = (value) => {
  if (!value) return null;
  const text = String(value);
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59` : text);
};

export const shapeOverlay = (o) => ({
  id: o._id,
  title: o.title,
  kind: o.kind,
  media: o.media?.url || null,
  channels: o.channels || [],
  position: o.position,
  size: o.size,
  url: o.url,
  firstDelaySeconds: o.firstDelaySeconds,
  durationSeconds: o.durationSeconds,
  intervalSeconds: o.intervalSeconds,
  enabled: o.enabled,
  startAt: o.startAt,
  endAt: o.endAt,
  createdAt: o.createdAt,
});

const applyOverlay = (o, body) => {
  if (typeof body.title === "string" && body.title.trim()) o.title = body.title.trim().slice(0, 100);
  if (OVERLAY_POSITIONS.includes(body.position)) o.position = body.position;
  if (OVERLAY_SIZES.includes(body.size)) o.size = body.size;
  if (typeof body.url === "string") o.url = body.url.trim().slice(0, 500);
  if (body.channels !== undefined) {
    let list = body.channels;
    if (typeof list === "string") {
      try {
        list = JSON.parse(list);
      } catch {
        list = list.split(",");
      }
    }
    o.channels = (Array.isArray(list) ? list : []).map(String).filter(isId).slice(0, 500);
  }
  const limits = { firstDelaySeconds: [0, 86400], durationSeconds: [3, 120], intervalSeconds: [30, 86400] };
  for (const [key, [min, max]] of Object.entries(limits)) {
    if (body[key] !== undefined && body[key] !== "" && Number.isFinite(Number(body[key]))) o[key] = Math.min(max, Math.max(min, Number(body[key])));
  }
  if (body.enabled !== undefined) o.enabled = bool(body.enabled);
  if (body.startAt !== undefined) o.startAt = body.startAt ? new Date(body.startAt) : null;
  if (body.endAt !== undefined) o.endAt = endOfDay(body.endAt);
};

router.get("/live-tv-overlays", requireAdmin("live-tv"), async (req, res) => {
  const [overlays, channels, pipra] = await Promise.all([LiveTvOverlay.find().sort({ createdAt: -1 }), LiveTvChannel.find().sort({ order: 1, createdAt: 1 }), getPipraChannel()]);
  return successResponse(res, "Live TV overlays", {
    overlays: overlays.map(shapeOverlay),
    // Every channel an overlay can be pinned to, Pipra TV's own first.
    channels: [
      ...(pipra ? [{ id: pipra._id, name: pipra.name, logo: pipra.logo?.url || null }] : []),
      ...channels.map((c) => ({ id: c._id, name: c.name, logo: c.logo?.url || null })),
    ],
  });
});

// The picture comes as `thumbnail` (any image format), the video as `video`.
router.post("/live-tv-overlays", requireAdmin("live-tv"), handleUpload(videoUpload), discardStreamedUploadsOnFailure, async (req, res) => {
  try {
    const kind = OVERLAY_KINDS.includes(req.body?.kind) ? req.body.kind : "logo";
    const overlay = new LiveTvOverlay({ kind, title: req.body?.title || (kind === "logo" ? "Logo" : "Live TV ad") });
    applyOverlay(overlay, req.body || {});
    const image = req.files?.thumbnail?.[0];
    const video = req.files?.video?.[0];
    if (kind === "video") {
      if (!video) return errorResponse(res, "Choose the video", 400);
      overlay.media = video.bunnyUrl ? { url: video.bunnyUrl, fileName: video.bunnyFileName } : await storeMediaFile(video, "overlay-video");
    } else {
      if (!image) return errorResponse(res, kind === "logo" ? "Choose the logo" : "Choose the image", 400);
      overlay.media = await storeImage(image, kind === "logo" ? "overlay-logo" : "overlay-image");
    }
    await overlay.save();
    return successResponse(res, "Overlay created", { overlay: shapeOverlay(overlay) }, 201);
  } catch (error) {
    return errorResponse(res, error.message, error.status || 500);
  }
});

router.patch("/live-tv-overlays/:id", requireAdmin("live-tv"), handleUpload(imageUpload.single("thumbnail")), async (req, res) => {
  try {
    const overlay = isId(req.params.id) ? await LiveTvOverlay.findById(req.params.id) : null;
    if (!overlay) return errorResponse(res, "Overlay not found", 404);
    applyOverlay(overlay, req.body || {});
    if (req.file && overlay.kind !== "video") {
      const previous = overlay.media?.fileName;
      overlay.media = await storeImage(req.file, overlay.kind === "logo" ? "overlay-logo" : "overlay-image");
      removeStored(previous);
    }
    await overlay.save();
    return successResponse(res, "Overlay saved", { overlay: shapeOverlay(overlay) });
  } catch (error) {
    return errorResponse(res, error.message, error.status || 500);
  }
});

router.delete("/live-tv-overlays/:id", requireAdmin("live-tv"), async (req, res) => {
  const overlay = isId(req.params.id) ? await LiveTvOverlay.findById(req.params.id) : null;
  if (!overlay) return errorResponse(res, "Overlay not found", 404);
  removeStored(overlay.media?.fileName);
  await overlay.deleteOne();
  return successResponse(res, "Overlay deleted");
});

// ================= Live TV =================

export const shapeLive = (c) => ({
  _id: c._id,
  id: c._id,
  name: c.name,
  streamUrl: c.streamUrl,
  logo: c.logo?.url || null,
  categories: c.categories,
  showOnList: c.showOnList,
  pinned: c.pinned,
  homeFeatured: c.homeFeatured,
  enabled: c.enabled,
  order: c.order,
  channelType: "external",
});

router.get("/live-tv", requireAdmin("live-tv"), async (req, res) => {
  const channels = await LiveTvChannel.find().sort({ order: 1, createdAt: 1 });
  return successResponse(res, "Live TV", { channels: channels.map(shapeLive), categories: LIVE_TV_CATEGORIES });
});

router.get("/live-tv/source", requireAdmin("live-tv"), async (req, res) => {
  try {
    const { channels, stale } = await loadLiveTvSourceChannels();
    return successResponse(res, "Source list", { channels, stale });
  } catch (error) {
    return errorResponse(res, error.message, 502);
  }
});

const applyLive = (channel, body) => {
  if (typeof body.name === "string" && body.name.trim()) channel.name = body.name.trim().slice(0, 80);
  if (typeof body.streamUrl === "string" && body.streamUrl.trim()) channel.streamUrl = body.streamUrl.trim();
  const categories = parseLiveTvCategories(body.categories);
  if (categories) channel.categories = categories;
  for (const key of ["showOnList", "pinned", "homeFeatured", "enabled"]) if (body[key] !== undefined) channel[key] = bool(body[key]);
  if (body.order !== undefined && Number.isFinite(Number(body.order))) channel.order = Number(body.order);
};

router.post("/live-tv", requireAdmin("live-tv"), handleUpload(imageUpload.single("logo")), async (req, res) => {
  try {
    if (!req.body?.name?.trim() || !req.body?.streamUrl?.trim()) return errorResponse(res, "Name and stream URL are required", 400);
    const channel = new LiveTvChannel({ name: req.body.name, streamUrl: req.body.streamUrl, order: await LiveTvChannel.countDocuments() });
    applyLive(channel, req.body);
    if (req.file) channel.logo = await storeImage(req.file, "live-logo");
    await channel.save();
    return successResponse(res, "Channel added", { channel: shapeLive(channel) }, 201);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.patch("/live-tv/:id", requireAdmin("live-tv"), handleUpload(imageUpload.single("logo")), async (req, res) => {
  const channel = isId(req.params.id) ? await LiveTvChannel.findById(req.params.id) : null;
  if (!channel) return errorResponse(res, "Channel not found", 404);
  applyLive(channel, req.body || {});
  if (req.file) {
    const previous = channel.logo?.fileName;
    channel.logo = await storeImage(req.file, "live-logo");
    removeStored(previous);
  }
  await channel.save();
  return successResponse(res, "Channel saved", { channel: shapeLive(channel) });
});

router.delete("/live-tv/:id", requireAdmin("live-tv"), async (req, res) => {
  const channel = isId(req.params.id) ? await LiveTvChannel.findById(req.params.id) : null;
  if (!channel) return errorResponse(res, "Channel not found", 404);
  removeStored(channel.logo?.fileName);
  await channel.deleteOne();
  return successResponse(res, "Channel deleted");
});

// One-time import of the old site's external channels (read only there):
// copies name, stream, categories and flags, and moves each logo to Bunny.
// Runs in the background — the old server sends images slowly.
const importJob = { running: false, total: 0, done: 0, added: 0, skipped: 0, failed: 0, error: null, finishedAt: null };

const legacyOrigin = () => (process.env.LEGACY_API_URL || "https://api.pipratv.com").replace(/\/$/, "");

const runImport = async () => {
  Object.assign(importJob, { running: true, total: 0, done: 0, added: 0, skipped: 0, failed: 0, error: null, finishedAt: null });
  try {
    const response = await fetch(`${legacyOrigin()}/api/site/live-tv?limit=500`, { signal: AbortSignal.timeout(60000) });
    const list = (await response.json())?.data?.channels || [];
    const external = list.filter((c) => c.channelType !== "scheduled" && c.streamUrl);
    importJob.total = external.length;
    const existing = new Set((await LiveTvChannel.find().select("streamUrl")).map((c) => c.streamUrl));
    let order = await LiveTvChannel.countDocuments();

    const queue = [...external];
    const worker = async () => {
      while (queue.length) {
        const source = queue.shift();
        try {
          if (existing.has(source.streamUrl)) {
            importJob.skipped += 1;
            continue;
          }
          existing.add(source.streamUrl);
          let logo = {};
          if (source.logo) {
            try {
              const image = await fetch(`${legacyOrigin()}${source.logo}`, { signal: AbortSignal.timeout(5 * 60 * 1000) });
              if (image.ok) {
                const buffer = Buffer.from(await image.arrayBuffer());
                logo = await saveLocalImage(buffer, "live-logo", source.logo);
              }
            } catch {
              // Keep the channel; the admin can add a logo later.
            }
          }
          await LiveTvChannel.create({
            name: source.name,
            streamUrl: source.streamUrl,
            logo,
            categories: parseLiveTvCategories(source.categories || []) || [],
            showOnList: Boolean(source.showOnList),
            pinned: Boolean(source.pinned),
            homeFeatured: Boolean(source.homeFeatured),
            order: (order += 1),
          });
          importJob.added += 1;
        } catch {
          importJob.failed += 1;
        } finally {
          importJob.done += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  } catch (error) {
    importJob.error = error.message;
  } finally {
    importJob.running = false;
    importJob.finishedAt = new Date();
  }
};

router.post("/live-tv/import", requireAdmin("live-tv"), (req, res) => {
  if (!importJob.running) runImport();
  return successResponse(res, "Import started", { job: importJob });
});

router.get("/live-tv/import", requireAdmin("live-tv"), (req, res) => successResponse(res, "Import status", { job: importJob }));

// ================= PipraTV's own channel =================

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const shapePipra = async (channel) => {
  await channel.populate([{ path: "loop", populate: { path: "channel" } }, { path: "schedule.video", populate: { path: "channel" } }]);
  const video = (v) => (v?.channel ? publicVideo(v, { owner: true }) : null);
  return {
    id: channel._id,
    name: channel.name,
    logo: channel.logo?.url || null,
    enabled: channel.enabled,
    homeFeatured: channel.homeFeatured,
    pinned: channel.pinned,
    categories: channel.categories,
    loop: channel.loop.map(video).filter(Boolean),
    schedule: channel.schedule
      .filter((slot) => slot.video)
      .map((slot) => ({ id: slot._id, startTime: slot.startTime, date: slot.date, video: video(slot.video) }))
      .filter((slot) => slot.video)
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.startTime.localeCompare(b.startTime)),
    nowPlaying: pipraNowPlaying(channel),
    serverTime: new Date(),
  };
};

// Library picker for the PipraTV channel (any published, non-private video).
router.get("/pipra-channel/pick", requireAdmin("live-tv"), async (req, res) => {
  const filter = { status: "published", visibility: { $ne: "private" } };
  if (req.query.search?.trim()) filter.title = new RegExp(req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const videos = await Video.find(filter).sort({ publishedAt: -1 }).limit(40).populate("channel");
  return successResponse(res, "Videos", { videos: videos.map((v) => publicVideo(v)) });
});

router.get("/pipra-channel", requireAdmin("live-tv"), async (req, res) => successResponse(res, "Pipra TV channel", { channel: await shapePipra(await getPipraChannel()) }));

router.put("/pipra-channel", requireAdmin("live-tv"), async (req, res) => {
  try {
    const channel = await getPipraChannel();
    const body = req.body || {};
    if (typeof body.name === "string" && body.name.trim()) channel.name = body.name.trim().slice(0, 80);
    for (const key of ["enabled", "homeFeatured", "pinned"]) if (body[key] !== undefined) channel[key] = bool(body[key]);
    const categories = parseLiveTvCategories(body.categories);
    if (categories) channel.categories = categories;
    if (Array.isArray(body.loop)) channel.loop = body.loop.filter(isId).slice(0, 300);
    if (Array.isArray(body.schedule)) {
      const bad = body.schedule.find((slot) => !isId(slot.video) || !TIME_RE.test(slot.startTime || "") || (slot.date && !DATE_RE.test(slot.date)));
      if (bad) return errorResponse(res, "Every schedule slot needs a video and a time like 20:30", 400);
      channel.schedule = body.schedule.slice(0, 500).map((slot) => ({ video: slot.video, startTime: slot.startTime, date: slot.date || null }));
    }
    await channel.save();
    return successResponse(res, "Pipra TV channel saved", { channel: await shapePipra(channel) });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.patch("/pipra-channel/logo", requireAdmin("live-tv"), handleUpload(imageUpload.single("logo")), async (req, res) => {
  if (!req.file) return errorResponse(res, "Choose an image", 400);
  const channel = await getPipraChannel();
  const previous = channel.logo?.fileName;
  channel.logo = await storeImage(req.file, "pipra-logo");
  removeStored(previous);
  await channel.save();
  return successResponse(res, "Logo saved", { channel: await shapePipra(channel) });
});

// ================= Site settings =================

const shapeSettings = (s) => ({
  siteName: s.siteName,
  logo: s.logo?.url || null,
  favicon: s.favicon?.url || null,
  socialLinks: s.socialLinks,
  footerLinks: s.footerLinks,
  contactEmail: s.contactEmail,
  announcement: s.announcement,
});

router.get("/settings", requireAdmin("settings"), async (req, res) => successResponse(res, "Settings", { settings: shapeSettings(await getSettings()) }));

router.patch(
  "/settings",
  requireAdmin("settings"),
  handleUpload(imageUpload.fields([{ name: "logo", maxCount: 1 }, { name: "favicon", maxCount: 1 }])),
  async (req, res) => {
    try {
      const s = await getSettings();
      const body = req.body || {};
      if (typeof body.siteName === "string" && body.siteName.trim()) s.siteName = body.siteName.trim().slice(0, 60);
      if (typeof body.contactEmail === "string") s.contactEmail = body.contactEmail.trim();
      const parse = (raw) => {
        try {
          return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          return undefined;
        }
      };
      const social = parse(body.socialLinks);
      if (social && typeof social === "object") {
        for (const key of ["facebook", "youtube", "telegram", "instagram", "tiktok"]) {
          if (typeof social[key] === "string") s.socialLinks[key] = social[key].trim();
        }
      }
      const footer = parse(body.footerLinks);
      if (Array.isArray(footer)) {
        s.footerLinks = footer.filter((l) => l?.label && l?.url).slice(0, 12).map((l) => ({ label: String(l.label).slice(0, 40), url: String(l.url).slice(0, 300) }));
      }
      const announcement = parse(body.announcement);
      if (announcement && typeof announcement === "object") {
        s.announcement = { text: String(announcement.text || "").slice(0, 200), url: String(announcement.url || ""), enabled: Boolean(announcement.enabled) };
      }
      for (const key of ["logo", "favicon"]) {
        const file = req.files?.[key]?.[0];
        if (file) {
          const previous = s[key]?.fileName;
          s[key] = await storeImage(file, `site-${key}`);
          removeStored(previous);
        }
        if (body[`remove_${key}`] === "1") {
          removeStored(s[key]?.fileName);
          s[key] = {};
        }
      }
      await s.save();
      return successResponse(res, "Settings saved", { settings: shapeSettings(s) });
    } catch (error) {
      return errorResponse(res, error.message, 500);
    }
  },
);

export default router;
