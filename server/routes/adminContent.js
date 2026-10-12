import express from "express";
import mongoose from "mongoose";

import User from "../models/User.js";
import Channel from "../models/Channel.js";
import Video, { VIDEO_CATEGORIES, VISIBILITIES } from "../models/Video.js";
import { Comment, CommentLike, Playlist, Reaction, Subscription, WatchHistory } from "../models/Engagement.js";
import { requireAdmin } from "../middleware/auth.js";
import { videoUpload, imageUpload, storeImage, removeStored } from "../config/uploads.js";
import { discardStreamedUploadsOnFailure } from "../config/bunnyStreamStorage.js";
import { handleUpload } from "../utils/handleUpload.js";
import { storeMediaFile } from "../utils/storeMedia.js";
import { getUploadProgress, clearUploadProgress } from "../utils/uploadProgress.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { channelSummary, publicChannel, publicUser, publicVideo } from "../utils/serialize.js";
import { notifySubscribers } from "../utils/notify.js";
import { job as importJob, runImport } from "../utils/importOld.js";
import Report, { REPORT_REASONS } from "../models/Report.js";
import { videoFromUpload } from "../utils/uploadToVideo.js";
import { videoFromStream } from "../utils/streamVideos.js";

// Admin panel: dashboard numbers and moderation of everything users made.
const router = express.Router();

const isId = (value) => mongoose.isValidObjectId(value);
const escape = (text) => String(text).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pageOf = (req, fallback = 25) => ({
  page: Math.max(1, parseInt(req.query.page, 10) || 1),
  limit: Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || fallback)),
});
const paged = (items, total, page, limit) => ({ items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });

const syncChannelCounts = async (channelId) => {
  const [videoCount, viewsAgg] = await Promise.all([
    Video.countDocuments({ channel: channelId, status: "published" }),
    Video.aggregate([{ $match: { channel: channelId } }, { $group: { _id: null, views: { $sum: "$views" } } }]),
  ]);
  await Channel.updateOne({ _id: channelId }, { videoCount, totalViews: viewsAgg[0]?.views || 0 });
};

// Removes a video and everything hanging off it (files included).
const destroyVideo = async (video) => {
  removeStored(video.file?.fileName);
  removeStored(video.thumbnail?.fileName);
  const commentIds = (await Comment.find({ video: video._id }).select("_id")).map((c) => c._id);
  await Promise.all([
    Reaction.deleteMany({ video: video._id }),
    Comment.deleteMany({ video: video._id }),
    CommentLike.deleteMany({ comment: { $in: commentIds } }),
    WatchHistory.deleteMany({ video: video._id }),
    Playlist.updateMany({ videos: video._id }, { $pull: { videos: video._id } }),
  ]);
  await video.deleteOne();
};

// ================= dashboard =================

router.get("/dashboard", requireAdmin("dashboard"), async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const since = new Date(today.getTime() - 13 * 24 * 3600 * 1000);

    const daily = (Model, field = "createdAt") =>
      Model.aggregate([
        { $match: { [field]: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${field}` } }, count: { $sum: 1 } } },
      ]);

    const [users, channels, videos, shorts, comments, subscriptions, viewsAgg, usersToday, videosToday, userDays, videoDays, top, recent] =
      await Promise.all([
        User.countDocuments(),
        Channel.countDocuments(),
        Video.countDocuments({ status: "published" }),
        Video.countDocuments({ status: "published", isShort: true }),
        Comment.countDocuments(),
        Subscription.countDocuments(),
        Video.aggregate([{ $group: { _id: null, views: { $sum: "$views" }, likes: { $sum: "$likes" } } }]),
        User.countDocuments({ createdAt: { $gte: today } }),
        Video.countDocuments({ createdAt: { $gte: today } }),
        daily(User),
        daily(Video),
        Video.find({ status: "published" }).sort({ views: -1 }).limit(8).populate("channel"),
        Video.find().sort({ createdAt: -1 }).limit(8).populate("channel"),
      ]);

    const fill = (rows) => {
      const map = new Map(rows.map((r) => [r._id, r.count]));
      return Array.from({ length: 14 }, (_, i) => {
        const d = new Date(since.getTime() + i * 24 * 3600 * 1000);
        const key = d.toISOString().slice(0, 10);
        return { label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), count: map.get(key) || 0 };
      });
    };

    return successResponse(res, "Dashboard", {
      totals: {
        users,
        channels,
        videos,
        shorts,
        comments,
        subscriptions,
        views: viewsAgg[0]?.views || 0,
        likes: viewsAgg[0]?.likes || 0,
        usersToday,
        videosToday,
      },
      signups: fill(userDays),
      uploads: fill(videoDays),
      topVideos: top.map((v) => publicVideo(v, { owner: true })),
      recentVideos: recent.map((v) => publicVideo(v, { owner: true })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// ================= videos =================

router.get("/videos", requireAdmin("videos"), async (req, res) => {
  try {
    const { search, status, type, visibility, channel, sort } = req.query;
    const filter = {};
    if (status === "removed" || status === "published") filter.status = status;
    if (type === "shorts") filter.isShort = true;
    if (type === "videos") filter.isShort = false;
    if (VISIBILITIES.includes(visibility)) filter.visibility = visibility;
    if (isId(channel)) filter.channel = channel;
    if (search?.trim()) {
      const pattern = new RegExp(escape(search), "i");
      filter.$or = [{ title: pattern }, { tags: pattern }];
    }
    const order = sort === "views" ? { views: -1 } : sort === "oldest" ? { createdAt: 1 } : sort === "likes" ? { likes: -1 } : { createdAt: -1 };
    const { page, limit } = pageOf(req);
    const [videos, total] = await Promise.all([
      Video.find(filter).sort(order).skip((page - 1) * limit).limit(limit).populate("channel"),
      Video.countDocuments(filter),
    ]);
    return successResponse(res, "Videos", paged(videos.map((v) => publicVideo(v, { owner: true })), total, page, limit));
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.get("/videos/:id", requireAdmin("videos"), async (req, res) => {
  const video = isId(req.params.id) ? await Video.findById(req.params.id).populate("channel") : null;
  if (!video) return errorResponse(res, "Video not found", 404);
  return successResponse(res, "Video", { video: publicVideo(video, { owner: true }) });
});

const applyVideoFields = (video, body) => {
  const { title, description, category, visibility, allowComments, madeForKids, tags, publishAt } = body;
  if (typeof title === "string" && title.trim()) video.title = title.trim().slice(0, 120);
  if (typeof description === "string") video.description = description.slice(0, 5000);
  if (VIDEO_CATEGORIES.includes(category)) video.category = category;
  if (VISIBILITIES.includes(visibility)) video.visibility = visibility;
  if (allowComments !== undefined) video.allowComments = String(allowComments) !== "false";
  if (madeForKids !== undefined) video.madeForKids = String(madeForKids) === "true";
  if (tags !== undefined) {
    let list = tags;
    try {
      list = typeof tags === "string" ? JSON.parse(tags) : tags;
    } catch {
      list = String(tags).split(",");
    }
    video.tags = (Array.isArray(list) ? list : [])
      .map((t) => String(t).trim().replace(/^#/, ""))
      .filter(Boolean)
      .slice(0, 15)
      .map((t) => t.slice(0, 40));
  }
  if (publishAt) {
    const when = new Date(publishAt);
    if (!Number.isNaN(when.getTime())) video.publishedAt = when;
  }
};

// Upload on behalf of any channel (e.g. the official PipraTV channel).
router.post("/videos", requireAdmin("videos"), handleUpload(videoUpload), discardStreamedUploadsOnFailure, async (req, res) => {
  const uploadId = req.query.uploadId;
  try {
    const channel = isId(req.body?.channelId) ? await Channel.findById(req.body.channelId) : null;
    if (!channel) return errorResponse(res, "Choose the channel this video belongs to", 400);
    const videoFile = req.files?.video?.[0];
    const thumbFile = req.files?.thumbnail?.[0];
    if (!String(req.body?.title || "").trim()) return errorResponse(res, "Add a title", 400);

    // Uploaded straight to Bunny Stream: it encodes, we publish when done.
    if (req.body?.streamGuid) {
      const video = await videoFromStream({
        guid: req.body.streamGuid,
        uploader: `admin:${req.admin._id}`,
        fields: { channel: channel._id, owner: channel.owner, title: req.body.title, thumbnail: thumbFile ? await storeImage(thumbFile, "thumb") : {} },
        apply: (v) => applyVideoFields(v, req.body || {}),
      });
      await video.populate("channel");
      return successResponse(res, "Uploaded — processing", { video: publicVideo(video, { owner: true }) }, 201);
    }

    // Chunked upload (any format, up to 50 GB): processed in the background.
    if (req.body?.sourceUploadId) {
      const video = await videoFromUpload({
        uploadId: req.body.sourceUploadId,
        uploader: `admin:${req.admin._id}`,
        fields: { channel: channel._id, owner: channel.owner, title: req.body.title, thumbnail: thumbFile ? await storeImage(thumbFile, "thumb") : {} },
        apply: (v) => applyVideoFields(v, req.body || {}),
      });
      await video.populate("channel");
      return successResponse(res, "Uploaded — processing", { video: publicVideo(video, { owner: true }) }, 201);
    }

    if (!videoFile) return errorResponse(res, "Choose a video file", 400);
    const durationSeconds = Number(req.body?.durationSeconds);
    if (!(durationSeconds > 0)) return errorResponse(res, "Couldn't read the video's length", 400);

    let stored = { url: videoFile.bunnyUrl, fileName: videoFile.bunnyFileName };
    if (!stored.url) stored = await storeMediaFile(videoFile, "video", uploadId);

    const video = new Video({
      channel: channel._id,
      owner: channel.owner,
      title: req.body.title,
      file: { provider: "storage", url: stored.url, fileName: stored.fileName, size: videoFile.size || 0, mimeType: videoFile.mimetype },
      thumbnail: thumbFile ? await storeImage(thumbFile, "thumb") : {},
      durationSeconds: Math.round(durationSeconds),
      width: Number(req.body?.width) || 0,
      height: Number(req.body?.height) || 0,
    });
    applyVideoFields(video, req.body || {});
    await video.save();
    await syncChannelCounts(channel._id);
    if (video.visibility === "public" && video.publishedAt <= new Date()) notifySubscribers(channel, video);
    await video.populate("channel");
    return successResponse(res, "Video published", { video: publicVideo(video, { owner: true }) }, 201);
  } catch (error) {
    return errorResponse(res, error.message, error.status || 500);
  } finally {
    clearUploadProgress(uploadId);
  }
});

// Channel picker for admin uploads (only needs the videos permission).
router.get("/pick-channels", requireAdmin("videos"), async (req, res) => {
  const filter = { status: "active" };
  if (req.query.search?.trim()) {
    const pattern = new RegExp(escape(req.query.search), "i");
    filter.$or = [{ name: pattern }, { handle: pattern }];
  }
  const channels = await Channel.find(filter).sort({ subscriberCount: -1 }).limit(20);
  return successResponse(res, "Channels", { channels: channels.map(channelSummary) });
});

router.get("/upload-progress/:uploadId", requireAdmin("videos"), (req, res) =>
  successResponse(res, "Progress", { percent: getUploadProgress(req.params.uploadId) ?? 0 }),
);

router.patch("/videos/:id", requireAdmin("videos"), handleUpload(imageUpload.single("thumbnail")), async (req, res) => {
  try {
    const video = isId(req.params.id) ? await Video.findById(req.params.id) : null;
    if (!video) return errorResponse(res, "Video not found", 404);
    applyVideoFields(video, req.body || {});
    // Move to another channel (its owner becomes the video's owner).
    const previousChannel = video.channel;
    if (req.body?.channelId && isId(req.body.channelId) && String(req.body.channelId) !== String(video.channel)) {
      const target = await Channel.findById(req.body.channelId);
      if (!target) return errorResponse(res, "Channel not found", 404);
      video.channel = target._id;
      video.owner = target.owner;
    }
    // Take down / restore.
    if (req.body?.status === "removed") {
      video.status = "removed";
      video.removedReason = String(req.body?.removedReason || "Removed by PipraTube").slice(0, 300);
    } else if (req.body?.status === "published") {
      video.status = "published";
      video.removedReason = null;
    }
    if (req.file) {
      const previous = video.thumbnail?.fileName;
      video.thumbnail = await storeImage(req.file, "thumb");
      removeStored(previous);
    }
    await video.save();
    await syncChannelCounts(video.channel);
    if (String(previousChannel) !== String(video.channel)) await syncChannelCounts(previousChannel);
    await video.populate("channel");
    return successResponse(res, "Video saved", { video: publicVideo(video, { owner: true }) });
  } catch (error) {
    if (error.name === "ValidationError") return errorResponse(res, Object.values(error.errors)[0]?.message || "Check the fields", 400);
    return errorResponse(res, error.message, 500);
  }
});

router.delete("/videos/:id", requireAdmin("videos"), async (req, res) => {
  const video = isId(req.params.id) ? await Video.findById(req.params.id) : null;
  if (!video) return errorResponse(res, "Video not found", 404);
  const channelId = video.channel;
  await destroyVideo(video);
  await syncChannelCounts(channelId);
  return successResponse(res, "Video deleted");
});

// One-time copy of the old site's videos into an official PipraTV channel
// (see utils/importOld.js). Main admin only.
router.post("/import-old-content", requireAdmin(), (req, res) => {
  if (req.admin.role !== "super") return errorResponse(res, "Only the main admin can import", 403);
  runImport();
  return successResponse(res, "Import started", { job: importJob });
});

router.get("/import-old-content", requireAdmin(), (req, res) => successResponse(res, "Import status", { job: importJob }));

// ================= users =================

router.get("/users", requireAdmin("users"), async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = {};
    if (status === "active" || status === "blocked") filter.status = status;
    if (search?.trim()) {
      const pattern = new RegExp(escape(search), "i");
      filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
    }
    const { page, limit } = pageOf(req);
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter),
    ]);
    const channels = await Channel.find({ owner: { $in: users.map((u) => u._id) } });
    const byOwner = new Map(channels.map((c) => [String(c.owner), c]));
    return successResponse(
      res,
      "Users",
      paged(
        users.map((u) => ({ ...publicUser(u), lastLoginAt: u.lastLoginAt, channel: byOwner.get(String(u._id)) ? channelSummary(byOwner.get(String(u._id))) : null })),
        total,
        page,
        limit,
      ),
    );
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.patch("/users/:id", requireAdmin("users"), async (req, res) => {
  const user = isId(req.params.id) ? await User.findById(req.params.id) : null;
  if (!user) return errorResponse(res, "User not found", 404);
  if (req.body?.status === "blocked" || req.body?.status === "active") {
    if (user.status !== req.body.status) user.tokenVersion = (user.tokenVersion || 0) + 1; // sign out everywhere
    user.status = req.body.status;
  }
  if (typeof req.body?.name === "string" && req.body.name.trim()) user.name = req.body.name.trim().slice(0, 80);
  await user.save();
  return successResponse(res, "User saved", { user: publicUser(user) });
});

// ================= channels =================

router.get("/channels", requireAdmin("channels"), async (req, res) => {
  try {
    const { search, status, verified } = req.query;
    const filter = {};
    if (status === "active" || status === "suspended") filter.status = status;
    if (verified === "true") filter.verified = true;
    if (search?.trim()) {
      const pattern = new RegExp(escape(search), "i");
      filter.$or = [{ name: pattern }, { handle: pattern }];
    }
    const { page, limit } = pageOf(req);
    const sort = req.query.sort === "subscribers" ? { subscriberCount: -1 } : req.query.sort === "views" ? { totalViews: -1 } : { createdAt: -1 };
    const [channels, total] = await Promise.all([
      Channel.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).populate("owner", "name email phone status"),
      Channel.countDocuments(filter),
    ]);
    return successResponse(
      res,
      "Channels",
      paged(
        channels.map((c) => ({ ...publicChannel(c), owner: c.owner ? { id: c.owner._id, name: c.owner.name, email: c.owner.email, phone: c.owner.phone, status: c.owner.status } : null })),
        total,
        page,
        limit,
      ),
    );
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.patch("/channels/:id", requireAdmin("channels"), async (req, res) => {
  const channel = isId(req.params.id) ? await Channel.findById(req.params.id) : null;
  if (!channel) return errorResponse(res, "Channel not found", 404);
  const { verified, status, name, description } = req.body || {};
  if (verified !== undefined) channel.verified = Boolean(verified);
  if (status === "active" || status === "suspended") channel.status = status;
  if (typeof name === "string" && name.trim()) channel.name = name.trim().slice(0, 60);
  if (typeof description === "string") channel.description = description.slice(0, 1000);
  await channel.save();
  return successResponse(res, "Channel saved", { channel: publicChannel(channel) });
});

// ================= comments =================

router.get("/comments", requireAdmin("comments"), async (req, res) => {
  try {
    const filter = {};
    if (req.query.search?.trim()) filter.text = new RegExp(escape(req.query.search), "i");
    if (isId(req.query.video)) filter.video = req.query.video;
    const { page, limit } = pageOf(req, 30);
    const [comments, total] = await Promise.all([
      Comment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("user", "name email").populate("video", "title"),
      Comment.countDocuments(filter),
    ]);
    return successResponse(
      res,
      "Comments",
      paged(
        comments.map((c) => ({
          id: c._id,
          text: c.text,
          likes: c.likes,
          isReply: Boolean(c.parent),
          replyCount: c.replyCount,
          createdAt: c.createdAt,
          user: c.user ? { id: c.user._id, name: c.user.name, email: c.user.email } : null,
          video: c.video ? { id: c.video._id, title: c.video.title } : null,
        })),
        total,
        page,
        limit,
      ),
    );
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// ================= Reports (viewers flagging videos) =================

router.get("/reports", requireAdmin("videos"), async (req, res) => {
  const status = ["open", "resolved", "dismissed"].includes(req.query.status) ? req.query.status : "open";
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const [items, total, open] = await Promise.all([
    Report.find({ status }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate({ path: "video", populate: { path: "channel" } })
      .populate("reporter", "name email phone"),
    Report.countDocuments({ status }),
    Report.countDocuments({ status: "open" }),
  ]);
  return successResponse(res, "Reports", {
    items: items.map((r) => ({
      id: r._id,
      reason: r.reason,
      reasonLabel: REPORT_REASONS[r.reason] || r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt,
      reporter: r.reporter ? { name: r.reporter.name, contact: r.reporter.email || r.reporter.phone } : null,
      video: r.video?.channel ? publicVideo(r.video, { owner: true }) : null,
    })),
    total,
    open,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

router.patch("/reports/:id", requireAdmin("videos"), async (req, res) => {
  const status = req.body?.status;
  if (!["open", "resolved", "dismissed"].includes(status)) return errorResponse(res, "Unknown status", 400);
  const report = isId(req.params.id) ? await Report.findById(req.params.id) : null;
  if (!report) return errorResponse(res, "Report not found", 404);
  report.status = status;
  report.handledAt = status === "open" ? null : new Date();
  await report.save();
  return successResponse(res, "Report updated", { id: report._id, status: report.status });
});

router.delete("/comments/:id", requireAdmin("comments"), async (req, res) => {
  const comment = isId(req.params.id) ? await Comment.findById(req.params.id) : null;
  if (!comment) return errorResponse(res, "Comment not found", 404);
  const replies = comment.parent ? [] : await Comment.find({ parent: comment._id }).select("_id");
  const ids = [comment._id, ...replies.map((r) => r._id)];
  await Comment.deleteMany({ _id: { $in: ids } });
  await CommentLike.deleteMany({ comment: { $in: ids } });
  await Video.updateOne({ _id: comment.video }, { $inc: { commentCount: -ids.length } });
  if (comment.parent) await Comment.updateOne({ _id: comment.parent }, { $inc: { replyCount: -1 } });
  return successResponse(res, "Comment deleted", { removed: ids.length });
});

export default router;
