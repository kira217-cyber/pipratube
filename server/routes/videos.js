import express from "express";
import mongoose from "mongoose";

import Channel from "../models/Channel.js";
import Video, { VIDEO_CATEGORIES } from "../models/Video.js";
import { optionalUser } from "../middleware/auth.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { publicVideo } from "../utils/serialize.js";
import { publicUrl } from "../utils/localFiles.js";
import { Playlist, Reaction, Subscription, WatchHistory } from "../models/Engagement.js";
import Report, { REPORT_REASONS } from "../models/Report.js";
import { rankedVideoIds, searchQuery, searchWords } from "../utils/search.js";

// Public viewing side: feeds, Shorts, search, a single video.
const router = express.Router();

// What anyone may see in a list: published, public, already released.
const listable = () => ({ status: "published", visibility: "public", publishedAt: { $lte: new Date() } });

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const page = (req, max = 60, fallback = 24) => ({
  page: Math.max(1, parseInt(req.query.page, 10) || 1),
  limit: Math.min(max, Math.max(1, parseInt(req.query.limit, 10) || fallback)),
});

// FNV-1a: a stable 32-bit score for an id under a given seed.
const seededScore = (seed, id) => {
  let hash = 2166136261;
  const text = `${seed}:${id}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

// GET /api/videos?sort=latest|popular|trending|random|shuffle&seed=&type=shorts|videos&category=&channel=&search=
// "shuffle" is a fresh order per seed (one per visit) that stays the same
// while that visitor pages through it, so nothing repeats or goes missing.
router.get("/", async (req, res) => {
  try {
    const { sort, type, category, channel, search, exclude } = req.query;
    const filter = listable();

    if (type === "shorts") filter.isShort = true;
    if (type === "videos") filter.isShort = false;
    if (category && VIDEO_CATEGORIES.includes(category)) filter.category = category;
    if (channel && mongoose.isValidObjectId(channel)) filter.channel = new mongoose.Types.ObjectId(String(channel));
    if (exclude && mongoose.isValidObjectId(exclude)) filter._id = { $ne: new mongoose.Types.ObjectId(String(exclude)) };
    const { page: p, limit } = page(req);

    if (typeof search === "string" && search.trim()) {
      // No sort (or "relevance"): best matches first, like YouTube.
      if (!sort || sort === "relevance") {
        const ids = await rankedVideoIds(search, filter);
        const slice = ids.slice((p - 1) * limit, p * limit);
        const rows = await Video.find({ _id: { $in: slice } }).populate("channel");
        const byId = new Map(rows.map((v) => [String(v._id), v]));
        const videos = slice.map((id) => byId.get(id)).filter((v) => v?.channel?.status === "active");
        return successResponse(res, "Videos", {
          videos: videos.map((v) => publicVideo(v)),
          total: ids.length,
          page: p,
          totalPages: Math.max(1, Math.ceil(ids.length / limit)),
        });
      }
      const query = await searchQuery(search);
      if (!query) return successResponse(res, "Videos", { videos: [], total: 0, page: 1, totalPages: 1 });
      filter.$or = query.or;
    }

    if (sort === "random") {
      const sampled = await Video.aggregate([{ $match: filter }, { $sample: { size: limit } }]);
      const videos = await Video.populate(sampled, { path: "channel" });
      return successResponse(res, "Videos", { videos: videos.filter((v) => v.channel?.status === "active").map((v) => publicVideo(v)), total: videos.length, page: 1, totalPages: 1 });
    }

    if (sort === "shuffle") {
      const seed = String(req.query.seed || "0").slice(0, 32);
      const ids = (await Video.find(filter).select("_id").lean()).map((row) => String(row._id));
      ids.sort((x, y) => seededScore(seed, x) - seededScore(seed, y));
      const slice = ids.slice((p - 1) * limit, p * limit);
      const rows = await Video.find({ _id: { $in: slice } }).populate("channel");
      const byId = new Map(rows.map((v) => [String(v._id), v]));
      const videos = slice.map((id) => byId.get(id)).filter((v) => v?.channel?.status === "active");
      return successResponse(res, "Videos", {
        videos: videos.map((v) => publicVideo(v)),
        total: ids.length,
        page: p,
        totalPages: Math.max(1, Math.ceil(ids.length / limit)),
      });
    }

    if (sort === "trending") {
      // Views and likes, weighted towards the last couple of weeks.
      const weekMs = 7 * 24 * 3600 * 1000;
      const pipeline = [
        { $match: filter },
        {
          $addFields: {
            _score: {
              $divide: [
                { $add: ["$views", { $multiply: ["$likes", 20] }, { $multiply: ["$commentCount", 30] }, 1] },
                { $add: [1, { $divide: [{ $subtract: [new Date(), "$publishedAt"] }, weekMs] }] },
              ],
            },
          },
        },
        { $sort: { _score: -1 } },
        { $skip: (p - 1) * limit },
        { $limit: limit },
      ];
      const [rows, total] = await Promise.all([Video.aggregate(pipeline), Video.countDocuments(filter)]);
      const videos = await Video.populate(rows, { path: "channel" });
      return successResponse(res, "Videos", {
        videos: videos.filter((v) => v.channel?.status === "active").map((v) => publicVideo(v)),
        total,
        page: p,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    }

    const order =
      sort === "popular" ? { views: -1, publishedAt: -1 } : sort === "oldest" ? { publishedAt: 1 } : { publishedAt: -1 };
    const [videos, total] = await Promise.all([
      Video.find(filter).sort(order).skip((p - 1) * limit).limit(limit).populate("channel"),
      Video.countDocuments(filter),
    ]);

    return successResponse(res, "Videos", {
      videos: videos.filter((v) => v.channel?.status === "active").map((v) => publicVideo(v)),
      total,
      page: p,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// One video. Unlisted ones open by link; private ones only for the owner.
// Reasons offered in the "Report" dialog (before "/:id", which would catch it).
// GET /api/videos/suggest?q= — what the search box offers while typing:
// short phrases from the best-matching titles (with a thumbnail) and channels.
router.get("/suggest", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 100);
    if (!q) return successResponse(res, "Suggestions", { suggestions: [], channels: [] });
    const query = await searchQuery(q);
    if (!query) return successResponse(res, "Suggestions", { suggestions: [], channels: [] });

    const ids = (await rankedVideoIds(q, listable(), 400)).slice(0, 30);
    const rows = await Video.find({ _id: { $in: ids } }).select("title thumbnail").lean();
    const byId = new Map(rows.map((v) => [String(v._id), v]));
    const first = query.words[0];
    const seen = new Set();
    const suggestions = [];
    ids.forEach((id) => {
      const video = byId.get(id);
      if (!video || suggestions.length >= 10) return;
      // Titles like "Show S5 E117 | বাংলা নাম | Channel" — keep the part that matched.
      const parts = video.title.split(/\s[|•–—-]\s|\|/).map((t) => t.trim()).filter(Boolean);
      const part = parts.find((t) => searchWords(t).some((w) => w.startsWith(first))) || parts[0] || video.title;
      const text = part.toLowerCase().replace(/\s+/g, " ").slice(0, 80).trim();
      // Like YouTube, only phrases whose words start with what was typed.
      const textWords = searchWords(text);
      const fits = query.words.every((word) => textWords.some((t) => t.startsWith(word)));
      if (!text || !fits || seen.has(text)) return;
      seen.add(text);
      suggestions.push({ text, thumbnail: publicUrl(video.thumbnail?.url) || null, videoId: id });
    });

    const pattern = new RegExp(escape(q), "i");
    const channels = await Channel.find({ status: "active", $or: [{ name: pattern }, { handle: pattern }] })
      .sort({ subscriberCount: -1 })
      .limit(3)
      .lean();
    return successResponse(res, "Suggestions", {
      suggestions,
      channels: channels.map((c) => ({ id: c._id, name: c.name, handle: c.handle, avatar: publicUrl(c.avatar?.url) || null })),
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
});

router.get("/report-reasons", (req, res) =>
  successResponse(res, "Reasons", { reasons: Object.entries(REPORT_REASONS).map(([key, label]) => ({ key, label })) }),
);

router.get("/:id", optionalUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, "Video not found", 404);
    const video = await Video.findById(req.params.id).populate("channel");
    if (!video || video.status !== "published" || !video.channel || video.channel.status !== "active") {
      return errorResponse(res, "Video not found", 404);
    }

    const isOwner = req.user && String(video.owner) === String(req.user._id);
    const released = video.publishedAt <= new Date();
    if (!isOwner && (video.visibility === "private" || !released)) {
      return errorResponse(res, "This video is private", 404);
    }

    // What this viewer has already done: liked, subscribed, saved.
    let viewer = null;
    if (req.user) {
      const [reaction, sub, later] = await Promise.all([
        Reaction.findOne({ user: req.user._id, video: video._id }),
        Subscription.findOne({ subscriber: req.user._id, channel: video.channel._id }),
        Playlist.findOne({ owner: req.user._id, kind: "watch_later", videos: video._id }).select("_id"),
      ]);
      viewer = {
        reaction: reaction?.value || 0,
        subscribed: Boolean(sub),
        notify: sub?.notify || null,
        watchLater: Boolean(later),
      };
    }

    return successResponse(res, "Video", { video: publicVideo(video, { owner: isOwner }), viewer });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Counted when playback actually starts, not when a page/preview loads.
// One count per viewer per video per 6 hours (in memory — good enough until
// a proper watch-history collection lands).
const recentViews = new Map();
const VIEW_WINDOW_MS = 6 * 3600 * 1000;

router.post("/:id/view", optionalUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, "Video not found", 404);
    const viewer = req.user ? `u:${req.user._id}` : `v:${req.body?.visitorId || req.ip}`;
    const key = `${viewer}:${req.params.id}`;
    const last = recentViews.get(key);
    if (last && Date.now() - last < VIEW_WINDOW_MS) {
      if (req.user) {
        await WatchHistory.updateOne({ user: req.user._id, video: req.params.id }, { watchedAt: new Date() }, { upsert: true });
      }
      return successResponse(res, "Already counted", { counted: false });
    }
    recentViews.set(key, Date.now());

    const video = await Video.findOneAndUpdate(
      { _id: req.params.id, status: "published" },
      { $inc: { views: 1 } },
      { returnDocument: "after" },
    );
    if (!video) return errorResponse(res, "Video not found", 404);
    await Channel.updateOne({ _id: video.channel }, { $inc: { totalViews: 1 } });
    if (req.user) {
      await WatchHistory.updateOne({ user: req.user._id, video: video._id }, { watchedAt: new Date() }, { upsert: true });
    }
    return successResponse(res, "Counted", { counted: true, views: video.views });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.post("/:id/share", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, "Video not found", 404);
  const video = await Video.findOneAndUpdate({ _id: req.params.id }, { $inc: { shares: 1 } }, { returnDocument: "after" });
  if (!video) return errorResponse(res, "Video not found", 404);
  return successResponse(res, "Shared", { shares: video.shares });
});

// A viewer reports a video. One open report per person per video — sending
// it again just updates the reason.
router.post("/:id/report", optionalUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, "Video not found", 404);
    const video = await Video.findById(req.params.id).select("_id");
    if (!video) return errorResponse(res, "Video not found", 404);
    const reason = String(req.body?.reason || "");
    if (!REPORT_REASONS[reason]) return errorResponse(res, "Choose a reason", 400);
    const visitorId = String(req.body?.visitorId || "").slice(0, 64) || null;
    if (!req.user && !visitorId) return errorResponse(res, "Couldn't send the report", 400);

    const who = req.user ? { reporter: req.user._id } : { visitorId };
    await Report.findOneAndUpdate(
      { video: video._id, status: "open", ...who },
      { $set: { reason, details: String(req.body?.details || "").trim().slice(0, 500) }, $setOnInsert: { video: video._id, ...who } },
      { upsert: true },
    );
    return successResponse(res, "Thanks for reporting — our team will review this video.");
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

setInterval(() => {
  const cutoff = Date.now() - VIEW_WINDOW_MS;
  for (const [key, at] of recentViews) if (at < cutoff) recentViews.delete(key);
}, 30 * 60 * 1000).unref();

export default router;
