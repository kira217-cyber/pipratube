import express from "express";
import mongoose from "mongoose";

import Channel from "../models/Channel.js";
import { Ad, LiveTvChannel, LiveTvOverlay, activeAdFilter, getHomeConfig, getSettings } from "../models/Site.js";
import { LIVE_TV_CATEGORIES } from "../models/liveTvCategories.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { channelSummary, publicVideo } from "../utils/serialize.js";
import { shapeLive, shapeOverlay } from "./adminSite.js";
import { loadPipraChannel, pipraListing, pipraNowPlaying } from "../utils/pipraChannel.js";

// Public, site-wide data the client paints its chrome and Home from —
// everything here is managed in the admin panel.
const router = express.Router();

const watchable = (video) =>
  video?.channel && video.status === "published" && video.visibility === "public" && video.publishedAt <= new Date();

router.get("/settings", async (req, res) => {
  try {
    const [settings, home, homeAd, feedAds, liveTv, pipra] = await Promise.all([
      getSettings(),
      getHomeConfig(),
      Ad.findOne(activeAdFilter({ kind: "banner", placement: "home_top" })).sort({ createdAt: -1 }),
      Ad.find(activeAdFilter({ kind: "banner", placement: "home_feed" })).sort({ createdAt: -1 }).limit(5),
      LiveTvChannel.find({ enabled: true, homeFeatured: true }).sort({ order: 1 }),
      loadPipraChannel(),
    ]);

    await home.populate([
      { path: "pinnedVideos", populate: { path: "channel" } },
      { path: "pinnedShorts", populate: { path: "channel" } },
      { path: "sections.videos", populate: { path: "channel" } },
      { path: "featuredChannels" },
    ]);
    const videos = (list) => list.filter(watchable).map((v) => publicVideo(v));

    let channels = home.featuredChannels.filter((c) => c?.status === "active");
    if (channels.length === 0) {
      channels = await Channel.find({ status: "active", videoCount: { $gt: 0 } }).sort({ subscriberCount: -1, totalViews: -1 }).limit(20);
    }

    const banner = (ad) => (ad ? { id: ad._id, title: ad.title, image: ad.image?.url, url: ad.url } : null);

    return successResponse(res, "Site settings", {
      siteName: settings.siteName,
      logo: settings.logo?.url || null,
      favicon: settings.favicon?.url || null,
      socialLinks: settings.socialLinks,
      footerLinks: settings.footerLinks,
      contactEmail: settings.contactEmail,
      announcement: settings.announcement?.enabled ? settings.announcement : null,
      ads: { home: banner(homeAd), feed: feedAds.map(banner) },
      home: {
        pinnedVideos: videos(home.pinnedVideos),
        pinnedShorts: videos(home.pinnedShorts),
        sections: home.sections
          .filter((s) => s.enabled)
          .map((s) => ({ id: s._id, title: s.title, videos: videos(s.videos) }))
          .filter((s) => s.videos.length),
        shuffleVideos: home.shuffleVideos !== false,
        shuffleShorts: home.shuffleShorts !== false,
        shortsEvery: home.shortsEvery || 4,
      },
      channels: channels.map(channelSummary),
      // PipraTV's own channel always leads.
      liveTv: [...(pipra?.homeFeatured ? [pipraListing(pipra)] : []), ...liveTv.map(shapeLive)],
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.get("/live-tv", async (req, res) => {
  const filter = { enabled: true };
  if (req.query.search?.trim()) filter.name = new RegExp(req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const [channels, pipra] = await Promise.all([LiveTvChannel.find(filter).sort({ order: 1, createdAt: 1 }), loadPipraChannel()]);
  const ownMatches = pipra && (!filter.name || filter.name.test(pipra.name));
  return successResponse(res, "Live TV", {
    channels: [...(ownMatches ? [pipraListing(pipra)] : []), ...channels.map(shapeLive)],
    categories: LIVE_TV_CATEGORIES,
    total: channels.length,
    page: 1,
    totalPages: 1,
  });
});

router.get("/live-tv/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, "Channel not found", 404);
  const pipra = await loadPipraChannel();
  const isOwn = pipra && String(pipra._id) === req.params.id;
  const channel = isOwn ? null : await LiveTvChannel.findById(req.params.id);
  if (!isOwn && (!channel || !channel.enabled)) return errorResponse(res, "Channel not found", 404);
  const others = await LiveTvChannel.find({ enabled: true, ...(channel ? { _id: { $ne: channel._id } } : {}) }).sort({ order: 1 }).limit(16);
  const related = [...(pipra && !isOwn ? [pipraListing(pipra)] : []), ...others.map(shapeLive)];
  return successResponse(res, "Live TV channel", {
    channel: isOwn ? pipraListing(pipra) : shapeLive(channel),
    related,
    nowPlaying: isOwn ? pipraNowPlaying(pipra) : null,
  });
});

// GET /api/site/live-tv-overlays?channel=<id> — the logo and corner ads
// for one Live TV channel (overlays for "all channels" included).
router.get("/live-tv-overlays", async (req, res) => {
  const channel = String(req.query.channel || "");
  if (!mongoose.isValidObjectId(channel)) return successResponse(res, "Overlays", { overlays: [] });
  const now = new Date();
  const overlays = await LiveTvOverlay.find({
    enabled: true,
    "media.url": { $ne: null },
    $and: [
      { $or: [{ channels: { $size: 0 } }, { channels: channel }] },
      { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
      { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
    ],
  }).sort({ createdAt: -1 });
  return successResponse(res, "Overlays", { overlays: overlays.map(shapeOverlay) });
});

// Polled by the scheduled player to follow the timetable.
router.get("/live-tv/:id/now-playing", async (req, res) => {
  const pipra = await loadPipraChannel();
  if (!pipra || String(pipra._id) !== req.params.id) return successResponse(res, "Now playing", { nowPlaying: null });
  return successResponse(res, "Now playing", { nowPlaying: pipraNowPlaying(pipra) });
});

// In-player ads for one video or Live TV channel, in the shape the
// player's ad overlay expects.
router.get("/ad-campaigns", async (req, res) => {
  const { video, liveTv } = req.query;
  if (!video && !liveTv) return errorResponse(res, "A video or liveTv id is required", 400);
  const ads = await Ad.find(activeAdFilter({ kind: "video", ...(video ? { onVideos: true } : { onLiveTv: true }) })).sort({ createdAt: 1 });
  return successResponse(res, "Ad campaigns", {
    campaigns: ads
      .filter((ad) => ad.video?.url)
      .map((ad) => ({
        id: ad._id,
        type: "video",
        video: { url: ad.video.url },
        skipAfterSeconds: ad.skipAfterSeconds,
        clickUrl: ad.url || null,
        firstDelaySeconds: ad.firstDelaySeconds,
        intervalSeconds: ad.intervalSeconds,
      })),
  });
});

export default router;
