import express from "express";

import Channel from "../models/Channel.js";
import Video, { VIDEO_CATEGORIES, VISIBILITIES } from "../models/Video.js";
import { requireUser } from "../middleware/auth.js";
import { videoUpload, imageUpload, storeImage, removeStored } from "../config/uploads.js";
import { discardStreamedUploadsOnFailure } from "../config/bunnyStreamStorage.js";
import { handleUpload } from "../utils/handleUpload.js";
import { getUploadProgress, clearUploadProgress } from "../utils/uploadProgress.js";
import { storeMediaFile } from "../utils/storeMedia.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { videoFromUpload } from "../utils/uploadToVideo.js";
import { videoFromStream } from "../utils/streamVideos.js";
import { publicVideo } from "../utils/serialize.js";
import { notifySubscribers } from "../utils/notify.js";
import { Comment, CommentLike, Playlist, Reaction, WatchHistory } from "../models/Engagement.js";

// Creator side: everything a channel owner does with their own videos.
const router = express.Router();

const requireChannel = async (req, res, next) => {
  const channel = await Channel.findOne({ owner: req.user._id });
  if (!channel) return errorResponse(res, "Create your channel first", 403);
  if (channel.status !== "active") return errorResponse(res, "Your channel is suspended", 403);
  req.channel = channel;
  next();
};

router.use(requireUser, requireChannel);

const parseTags = (raw) => {
  if (raw === undefined) return undefined;
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      list = raw.split(",");
    }
  }
  return (Array.isArray(list) ? list : [])
    .map((tag) => String(tag).trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 15)
    .map((tag) => tag.slice(0, 40));
};

const applyDetails = (video, body) => {
  const { title, description, category, visibility, allowComments, madeForKids, publishAt } = body;
  if (typeof title === "string" && title.trim()) video.title = title.trim().slice(0, 120);
  if (typeof description === "string") video.description = description.slice(0, 5000);
  if (category && VIDEO_CATEGORIES.includes(category)) video.category = category;
  if (visibility && VISIBILITIES.includes(visibility)) video.visibility = visibility;
  if (allowComments !== undefined) video.allowComments = String(allowComments) !== "false";
  if (madeForKids !== undefined) video.madeForKids = String(madeForKids) === "true";
  const tags = parseTags(body.tags);
  if (tags !== undefined) video.tags = tags;
  // Scheduling: a future time keeps it hidden until then.
  if (publishAt) {
    const when = new Date(publishAt);
    if (!Number.isNaN(when.getTime())) video.publishedAt = when;
  }
};

const syncChannelCounts = async (channelId) => {
  const [videoCount, viewsAgg] = await Promise.all([
    Video.countDocuments({ channel: channelId, status: "published" }),
    Video.aggregate([{ $match: { channel: channelId } }, { $group: { _id: null, views: { $sum: "$views" } } }]),
  ]);
  await Channel.updateOne({ _id: channelId }, { videoCount, totalViews: viewsAgg[0]?.views || 0 });
};

// ---- upload ----

router.post("/videos", handleUpload(videoUpload), discardStreamedUploadsOnFailure, async (req, res) => {
  const uploadId = req.query.uploadId || req.body?.uploadId;
  const videoFile = req.files?.video?.[0];
  const thumbFile = req.files?.thumbnail?.[0];

  try {
    if (!String(req.body?.title || "").trim()) return errorResponse(res, "Add a title", 400);

    // Uploaded straight to Bunny Stream: it encodes, we publish when done.
    if (req.body?.streamGuid) {
      const video = await videoFromStream({
        guid: req.body.streamGuid,
        uploader: `user:${req.user._id}`,
        fields: { channel: req.channel._id, owner: req.user._id, title: req.body.title, thumbnail: thumbFile ? await storeImage(thumbFile, "thumb") : {} },
        apply: (v) => applyDetails(v, req.body || {}),
      });
      await video.populate("channel");
      return successResponse(res, "Uploaded — processing", { video: publicVideo(video, { owner: true }) }, 201);
    }

    // Chunked upload (any format, up to 50 GB): processed in the background.
    if (req.body?.sourceUploadId) {
      const video = await videoFromUpload({
        uploadId: req.body.sourceUploadId,
        uploader: `user:${req.user._id}`,
        fields: { channel: req.channel._id, owner: req.user._id, title: req.body.title, thumbnail: thumbFile ? await storeImage(thumbFile, "thumb") : {} },
        apply: (v) => applyDetails(v, req.body || {}),
      });
      await video.populate("channel");
      return successResponse(res, "Uploaded — processing", { video: publicVideo(video, { owner: true }) }, 201);
    }

    if (!videoFile) return errorResponse(res, "Choose a video file", 400);

    const durationSeconds = Number(req.body?.durationSeconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return errorResponse(res, "Couldn't read the video's length — try another file", 400);
    }

    // Streamed parts arrive already on the CDN; a buffered one is put there now.
    let stored = { url: videoFile.bunnyUrl, fileName: videoFile.bunnyFileName };
    if (!stored.url) stored = await storeMediaFile(videoFile, "video", uploadId);

    const thumbnail = thumbFile ? await storeImage(thumbFile, "thumb") : {};

    const video = new Video({
      channel: req.channel._id,
      owner: req.user._id,
      title: req.body.title,
      file: {
        provider: "storage",
        url: stored.url,
        fileName: stored.fileName,
        size: videoFile.size || 0,
        mimeType: videoFile.mimetype,
      },
      thumbnail,
      durationSeconds: Math.round(durationSeconds),
      width: Number(req.body?.width) || 0,
      height: Number(req.body?.height) || 0,
    });
    applyDetails(video, req.body || {});
    await video.save();
    await syncChannelCounts(req.channel._id);

    // Ring the bell for subscribers when it goes out publicly right away.
    if (video.visibility === "public" && video.publishedAt <= new Date()) notifySubscribers(req.channel, video);

    await video.populate("channel");
    return successResponse(res, "Video published", { video: publicVideo(video, { owner: true }) }, 201);
  } catch (error) {
    return errorResponse(res, error.message, error.status || 500);
  } finally {
    clearUploadProgress(uploadId);
  }
});

router.get("/upload-progress/:uploadId", (req, res) =>
  successResponse(res, "Progress", { percent: getUploadProgress(req.params.uploadId) ?? 0 }),
);

// ---- my videos ----

router.get("/videos", async (req, res) => {
  try {
    const { visibility, type, search, sort, page: p, limit: l } = req.query;
    const filter = { channel: req.channel._id, status: { $ne: "removed" } };
    if (visibility === "scheduled") filter.publishedAt = { $gt: new Date() };
    else if (VISIBILITIES.includes(visibility)) filter.visibility = visibility;
    if (visibility === "removed") filter.status = "removed";
    if (type === "shorts") filter.isShort = true;
    if (type === "videos") filter.isShort = false;
    if (typeof search === "string" && search.trim()) {
      filter.title = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }

    const order =
      sort === "oldest" ? { createdAt: 1 } : sort === "views" ? { views: -1 } : sort === "likes" ? { likes: -1 } : { createdAt: -1 };
    const page = Math.max(1, parseInt(p, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(l, 10) || 20));

    const [videos, total] = await Promise.all([
      Video.find(filter).sort(order).skip((page - 1) * limit).limit(limit).populate("channel"),
      Video.countDocuments(filter),
    ]);

    return successResponse(res, "Your videos", {
      videos: videos.map((video) => publicVideo(video, { owner: true })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.get("/videos/:id", async (req, res) => {
  const video = await Video.findOne({ _id: req.params.id, channel: req.channel._id }).populate("channel").catch(() => null);
  if (!video) return errorResponse(res, "Video not found", 404);
  return successResponse(res, "Video", { video: publicVideo(video, { owner: true }) });
});

router.patch("/videos/:id", handleUpload(imageUpload.single("thumbnail")), async (req, res) => {
  try {
    const video = await Video.findOne({ _id: req.params.id, channel: req.channel._id }).catch(() => null);
    if (!video) return errorResponse(res, "Video not found", 404);
    if (video.status === "removed") return errorResponse(res, "This video was removed by PipraTube", 403);

    applyDetails(video, req.body || {});
    if (req.file) {
      const previous = video.thumbnail?.fileName;
      video.thumbnail = await storeImage(req.file, "thumb");
      removeStored(previous);
    }
    await video.save();
    await video.populate("channel");

    return successResponse(res, "Video updated", { video: publicVideo(video, { owner: true }) });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.delete("/videos/:id", async (req, res) => {
  try {
    const video = await Video.findOneAndDelete({ _id: req.params.id, channel: req.channel._id }).catch(() => null);
    if (!video) return errorResponse(res, "Video not found", 404);
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
    await syncChannelCounts(req.channel._id);
    return successResponse(res, "Video deleted");
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// ---- dashboard numbers ----

router.get("/stats", async (req, res) => {
  try {
    const channelId = req.channel._id;
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [totals, byMonth, byCategory, top] = await Promise.all([
      Video.aggregate([
        { $match: { channel: channelId, status: { $ne: "removed" } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            shorts: { $sum: { $cond: ["$isShort", 1, 0] } },
            public: { $sum: { $cond: [{ $eq: ["$visibility", "public"] }, 1, 0] } },
            unlisted: { $sum: { $cond: [{ $eq: ["$visibility", "unlisted"] }, 1, 0] } },
            private: { $sum: { $cond: [{ $eq: ["$visibility", "private"] }, 1, 0] } },
            scheduled: { $sum: { $cond: [{ $gt: ["$publishedAt", now] }, 1, 0] } },
            views: { $sum: "$views" },
            likes: { $sum: "$likes" },
            comments: { $sum: "$commentCount" },
            shares: { $sum: "$shares" },
          },
        },
      ]),
      Video.aggregate([
        { $match: { channel: channelId, createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, count: { $sum: 1 } } },
      ]),
      Video.aggregate([
        { $match: { channel: channelId, status: { $ne: "removed" } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Video.find({ channel: channelId, status: "published" }).sort({ views: -1 }).limit(10).populate("channel"),
    ]);

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const counts = new Map(byMonth.map((row) => [`${row._id.y}-${row._id.m}`, row.count]));
    const uploadsOverTime = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { label: MONTHS[d.getMonth()], count: counts.get(`${d.getFullYear()}-${d.getMonth() + 1}`) || 0 };
    });

    const t = totals[0] || {};
    return successResponse(res, "Stats", {
      total: t.total || 0,
      shorts: t.shorts || 0,
      public: t.public || 0,
      unlisted: t.unlisted || 0,
      private: t.private || 0,
      scheduled: t.scheduled || 0,
      views: t.views || 0,
      likes: t.likes || 0,
      comments: t.comments || 0,
      shares: t.shares || 0,
      subscribers: req.channel.subscriberCount || 0,
      uploadsOverTime,
      categoryBreakdown: byCategory.map((row) => ({ category: row._id, count: row.count })),
      topVideos: top.map((video) => publicVideo(video, { owner: true })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

export default router;
