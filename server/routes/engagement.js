import express from "express";
import mongoose from "mongoose";

import Channel from "../models/Channel.js";
import Video from "../models/Video.js";
import {
  Comment,
  CommentLike,
  Notification,
  Playlist,
  Reaction,
  Subscription,
  WatchHistory,
} from "../models/Engagement.js";
import { optionalUser, requireUser } from "../middleware/auth.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { channelSummary, publicVideo } from "../utils/serialize.js";
import { notifyUser } from "../utils/notify.js";

// Likes, comments, subscriptions, notifications, history and playlists.
const router = express.Router();

const isId = (value) => mongoose.isValidObjectId(value);
const pageOf = (req, fallback = 20, max = 50) => ({
  page: Math.max(1, parseInt(req.query.page, 10) || 1),
  limit: Math.min(max, Math.max(1, parseInt(req.query.limit, 10) || fallback)),
});

// A video anyone may interact with right now.
const findWatchable = async (id) => {
  if (!isId(id)) return null;
  const video = await Video.findById(id);
  if (!video || video.status !== "published") return null;
  return video;
};

// ================= reactions =================

router.post("/videos/:id/reaction", requireUser, async (req, res) => {
  try {
    const video = await findWatchable(req.params.id);
    if (!video) return errorResponse(res, "Video not found", 404);

    const wanted = { like: 1, dislike: -1, none: 0 }[req.body?.value];
    if (wanted === undefined) return errorResponse(res, "value must be like, dislike or none", 400);

    const existing = await Reaction.findOne({ user: req.user._id, video: video._id });
    const before = existing?.value || 0;
    if (before === wanted) {
      return successResponse(res, "No change", { reaction: wanted, likes: video.likes, dislikes: video.dislikes });
    }

    if (wanted === 0) await existing.deleteOne();
    else if (existing) await Reaction.updateOne({ _id: existing._id }, { value: wanted });
    else await Reaction.create({ user: req.user._id, video: video._id, value: wanted });

    const inc = { likes: (wanted === 1) - (before === 1), dislikes: (wanted === -1) - (before === -1) };
    const updated = await Video.findByIdAndUpdate(video._id, { $inc: inc }, { returnDocument: "after" });

    return successResponse(res, "Saved", { reaction: wanted, likes: updated.likes, dislikes: updated.dislikes });
  } catch (error) {
    if (error?.code === 11000) return errorResponse(res, "Please try again", 409);
    return errorResponse(res, error.message, 500);
  }
});

router.get("/me/liked", requireUser, async (req, res) => {
  const { page, limit } = pageOf(req, 24);
  const rows = await Reaction.find({ user: req.user._id, value: 1 })
    .sort({ updatedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate({ path: "video", populate: { path: "channel" } });
  const videos = rows.map((row) => row.video).filter((v) => v && v.status === "published" && v.visibility !== "private");
  const total = await Reaction.countDocuments({ user: req.user._id, value: 1 });
  return successResponse(res, "Liked videos", { videos: videos.map((v) => publicVideo(v)), total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// ================= comments =================

// Comment authors are shown by their channel (name, @handle, picture)
// when they have one, otherwise by their account name.
const shapeComments = async (comments, viewer, video) => {
  const authorIds = [...new Set(comments.map((c) => String(c.user?._id || c.user)))];
  const channels = await Channel.find({ owner: { $in: authorIds } });
  const byOwner = new Map(channels.map((ch) => [String(ch.owner), ch]));
  const liked = viewer
    ? new Set((await CommentLike.find({ user: viewer._id, comment: { $in: comments.map((c) => c._id) } })).map((l) => String(l.comment)))
    : new Set();

  return comments.map((comment) => {
    const author = comment.user;
    const authorId = String(author?._id || author);
    const ch = byOwner.get(authorId);
    return {
      id: comment._id,
      parent: comment.parent,
      text: comment.text,
      likes: comment.likes,
      replyCount: comment.replyCount,
      pinned: comment.pinned,
      hearted: comment.hearted,
      edited: comment.edited,
      createdAt: comment.createdAt,
      liked: liked.has(String(comment._id)),
      mine: viewer ? String(viewer._id) === authorId : false,
      isCreator: String(video.owner) === authorId,
      author: {
        id: authorId,
        name: ch?.name || author?.name || "PipraTube user",
        handle: ch?.handle || null,
        avatar: ch?.avatar?.url || author?.avatar?.url || null,
        verified: Boolean(ch?.verified),
      },
    };
  });
};

router.get("/videos/:id/comments", optionalUser, async (req, res) => {
  try {
    const video = await findWatchable(req.params.id);
    if (!video) return errorResponse(res, "Video not found", 404);
    const { page, limit } = pageOf(req, 20);
    const filter = { video: video._id, parent: null, status: "visible" };
    const order = req.query.sort === "newest" ? { pinned: -1, createdAt: -1 } : { pinned: -1, likes: -1, replyCount: -1, createdAt: -1 };

    const [comments, total] = await Promise.all([
      Comment.find(filter).sort(order).skip((page - 1) * limit).limit(limit).populate("user", "name avatar"),
      Comment.countDocuments(filter),
    ]);

    return successResponse(res, "Comments", {
      comments: await shapeComments(comments, req.user, video),
      total,
      commentCount: video.commentCount,
      allowComments: video.allowComments !== false,
      isOwner: Boolean(req.user && String(req.user._id) === String(video.owner)),
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.get("/comments/:id/replies", optionalUser, async (req, res) => {
  try {
    if (!isId(req.params.id)) return errorResponse(res, "Comment not found", 404);
    const parent = await Comment.findById(req.params.id);
    if (!parent) return errorResponse(res, "Comment not found", 404);
    const video = await Video.findById(parent.video);
    const replies = await Comment.find({ parent: parent._id, status: "visible" }).sort({ createdAt: 1 }).limit(200).populate("user", "name avatar");
    return successResponse(res, "Replies", { replies: await shapeComments(replies, req.user, video) });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.post("/videos/:id/comments", requireUser, async (req, res) => {
  try {
    const video = await findWatchable(req.params.id);
    if (!video) return errorResponse(res, "Video not found", 404);
    if (video.allowComments === false) return errorResponse(res, "Comments are turned off for this video", 403);

    const text = String(req.body?.text || "").trim();
    if (!text) return errorResponse(res, "Write something first", 400);

    let parent = null;
    if (req.body?.parent) {
      parent = isId(req.body.parent) ? await Comment.findById(req.body.parent) : null;
      if (!parent || String(parent.video) !== String(video._id)) return errorResponse(res, "Comment not found", 404);
      if (parent.parent) parent = await Comment.findById(parent.parent); // keep replies one level deep
    }

    const comment = await Comment.create({ video: video._id, user: req.user._id, parent: parent?._id || null, text: text.slice(0, 2000) });
    await Video.updateOne({ _id: video._id }, { $inc: { commentCount: 1 } });
    if (parent) await Comment.updateOne({ _id: parent._id }, { $inc: { replyCount: 1 } });

    const channel = await Channel.findById(video.channel);
    if (parent) {
      notifyUser({ user: parent.user, type: "reply", actor: req.user._id, video: video._id, comment: comment._id, channel: channel?._id, text: text.slice(0, 300) });
    } else {
      notifyUser({ user: video.owner, type: "comment", actor: req.user._id, video: video._id, comment: comment._id, channel: channel?._id, text: text.slice(0, 300) });
    }

    await comment.populate("user", "name avatar");
    const [shaped] = await shapeComments([comment], req.user, video);
    return successResponse(res, "Comment added", { comment: shaped }, 201);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

const loadComment = async (req, res) => {
  if (!isId(req.params.id)) {
    errorResponse(res, "Comment not found", 404);
    return null;
  }
  const comment = await Comment.findById(req.params.id);
  if (!comment || comment.status !== "visible") {
    errorResponse(res, "Comment not found", 404);
    return null;
  }
  const video = await Video.findById(comment.video);
  return { comment, video, isAuthor: String(comment.user) === String(req.user._id), isOwner: video && String(video.owner) === String(req.user._id) };
};

router.patch("/comments/:id", requireUser, async (req, res) => {
  const found = await loadComment(req, res);
  if (!found) return undefined;
  if (!found.isAuthor) return errorResponse(res, "You can only edit your own comments", 403);
  const text = String(req.body?.text || "").trim();
  if (!text) return errorResponse(res, "Write something first", 400);
  found.comment.text = text.slice(0, 2000);
  found.comment.edited = true;
  await found.comment.save();
  return successResponse(res, "Comment edited", { text: found.comment.text, edited: true });
});

router.delete("/comments/:id", requireUser, async (req, res) => {
  const found = await loadComment(req, res);
  if (!found) return undefined;
  if (!found.isAuthor && !found.isOwner) return errorResponse(res, "You can't delete this comment", 403);

  const { comment } = found;
  const replies = comment.parent ? [] : await Comment.find({ parent: comment._id }).select("_id");
  const ids = [comment._id, ...replies.map((r) => r._id)];
  await Comment.deleteMany({ _id: { $in: ids } });
  await CommentLike.deleteMany({ comment: { $in: ids } });
  await Video.updateOne({ _id: comment.video }, { $inc: { commentCount: -ids.length } });
  if (comment.parent) await Comment.updateOne({ _id: comment.parent }, { $inc: { replyCount: -1 } });

  return successResponse(res, "Comment deleted", { removed: ids.length });
});

router.post("/comments/:id/like", requireUser, async (req, res) => {
  const found = await loadComment(req, res);
  if (!found) return undefined;
  const { comment } = found;
  const existing = await CommentLike.findOne({ user: req.user._id, comment: comment._id });
  if (existing) {
    await existing.deleteOne();
    comment.likes = Math.max(0, comment.likes - 1);
  } else {
    await CommentLike.create({ user: req.user._id, comment: comment._id }).catch(() => {});
    comment.likes += 1;
  }
  await Comment.updateOne({ _id: comment._id }, { likes: comment.likes });
  return successResponse(res, "Saved", { liked: !existing, likes: comment.likes });
});

// Creator tools on their own video's comments.
router.post("/comments/:id/pin", requireUser, async (req, res) => {
  const found = await loadComment(req, res);
  if (!found) return undefined;
  if (!found.isOwner) return errorResponse(res, "Only the creator can pin comments", 403);
  if (found.comment.parent) return errorResponse(res, "Replies can't be pinned", 400);
  const pin = !found.comment.pinned;
  if (pin) await Comment.updateMany({ video: found.comment.video, pinned: true }, { pinned: false });
  await Comment.updateOne({ _id: found.comment._id }, { pinned: pin });
  return successResponse(res, pin ? "Pinned" : "Unpinned", { pinned: pin });
});

router.post("/comments/:id/heart", requireUser, async (req, res) => {
  const found = await loadComment(req, res);
  if (!found) return undefined;
  if (!found.isOwner) return errorResponse(res, "Only the creator can heart comments", 403);
  const hearted = !found.comment.hearted;
  await Comment.updateOne({ _id: found.comment._id }, { hearted });
  if (hearted) {
    notifyUser({ user: found.comment.user, type: "heart", actor: req.user._id, video: found.comment.video, comment: found.comment._id, text: found.comment.text.slice(0, 300) });
  }
  return successResponse(res, hearted ? "Hearted" : "Removed heart", { hearted });
});

// ================= subscriptions =================

const loadChannel = async (req, res) => {
  const channel = isId(req.params.id) ? await Channel.findById(req.params.id) : null;
  if (!channel || channel.status !== "active") {
    errorResponse(res, "Channel not found", 404);
    return null;
  }
  return channel;
};

router.post("/channels/:id/subscribe", requireUser, async (req, res) => {
  try {
    const channel = await loadChannel(req, res);
    if (!channel) return undefined;
    if (String(channel.owner) === String(req.user._id)) return errorResponse(res, "You can't subscribe to your own channel", 400);

    const notify = req.body?.notify === "none" ? "none" : "all";
    const result = await Subscription.updateOne(
      { subscriber: req.user._id, channel: channel._id },
      { $setOnInsert: { notify } },
      { upsert: true },
    );
    let count = channel.subscriberCount;
    if (result.upsertedCount) {
      const updated = await Channel.findByIdAndUpdate(channel._id, { $inc: { subscriberCount: 1 } }, { returnDocument: "after" });
      count = updated.subscriberCount;
      notifyUser({ user: channel.owner, type: "subscriber", actor: req.user._id, channel: channel._id, text: req.user.name });
    }
    return successResponse(res, "Subscribed", { subscribed: true, notify, subscriberCount: count });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.delete("/channels/:id/subscribe", requireUser, async (req, res) => {
  const channel = await loadChannel(req, res);
  if (!channel) return undefined;
  const removed = await Subscription.findOneAndDelete({ subscriber: req.user._id, channel: channel._id });
  let count = channel.subscriberCount;
  if (removed) {
    const updated = await Channel.findByIdAndUpdate(channel._id, { $inc: { subscriberCount: -1 } }, { returnDocument: "after" });
    count = Math.max(0, updated.subscriberCount);
  }
  return successResponse(res, "Unsubscribed", { subscribed: false, subscriberCount: count });
});

router.patch("/channels/:id/subscribe", requireUser, async (req, res) => {
  const channel = await loadChannel(req, res);
  if (!channel) return undefined;
  const notify = req.body?.notify === "none" ? "none" : "all";
  const sub = await Subscription.findOneAndUpdate({ subscriber: req.user._id, channel: channel._id }, { notify }, { returnDocument: "after" });
  if (!sub) return errorResponse(res, "Subscribe first", 400);
  return successResponse(res, "Saved", { notify });
});

router.get("/me/subscriptions", requireUser, async (req, res) => {
  const subs = await Subscription.find({ subscriber: req.user._id }).sort({ createdAt: -1 }).populate("channel");
  return successResponse(res, "Subscriptions", {
    channels: subs.filter((s) => s.channel?.status === "active").map((s) => ({ ...channelSummary(s.channel), notify: s.notify })),
  });
});

// Latest uploads from the channels you follow.
router.get("/feed/subscriptions", requireUser, async (req, res) => {
  const { page, limit } = pageOf(req, 24, 60);
  const subs = await Subscription.find({ subscriber: req.user._id }).select("channel").lean();
  const filter = {
    channel: { $in: subs.map((s) => s.channel) },
    status: "published",
    visibility: "public",
    publishedAt: { $lte: new Date() },
  };
  if (req.query.type === "shorts") filter.isShort = true;
  if (req.query.type === "videos") filter.isShort = false;
  const [videos, total] = await Promise.all([
    Video.find(filter).sort({ publishedAt: -1 }).skip((page - 1) * limit).limit(limit).populate("channel"),
    Video.countDocuments(filter),
  ]);
  return successResponse(res, "Subscriptions feed", { videos: videos.map((v) => publicVideo(v)), total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// ================= notifications =================

router.get("/notifications", requireUser, async (req, res) => {
  const { page, limit } = pageOf(req, 20);
  const rows = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("actor", "name avatar")
    .populate("channel", "name handle avatar")
    .populate("video", "title thumbnail");
  const actorChannels = await Channel.find({ owner: { $in: rows.map((r) => r.actor?._id).filter(Boolean) } });
  const byOwner = new Map(actorChannels.map((ch) => [String(ch.owner), ch]));

  const unread = await Notification.countDocuments({ user: req.user._id, read: false });
  return successResponse(res, "Notifications", {
    unread,
    notifications: rows.map((n) => {
      const actorChannel = n.actor ? byOwner.get(String(n.actor._id)) : null;
      return {
        id: n._id,
        type: n.type,
        read: n.read,
        text: n.text,
        createdAt: n.createdAt,
        actor: n.actor
          ? { name: actorChannel?.name || n.actor.name, avatar: actorChannel?.avatar?.url || n.actor.avatar?.url || null, handle: actorChannel?.handle || null }
          : null,
        channel: n.channel ? { id: n.channel._id, name: n.channel.name, handle: n.channel.handle, avatar: n.channel.avatar?.url || null } : null,
        video: n.video ? { id: n.video._id, title: n.video.title, thumbnail: n.video.thumbnail?.url || null } : null,
        comment: n.comment || null,
      };
    }),
  });
});

router.get("/notifications/unread-count", requireUser, async (req, res) =>
  successResponse(res, "Unread", { unread: await Notification.countDocuments({ user: req.user._id, read: false }) }),
);

router.post("/notifications/read-all", requireUser, async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  return successResponse(res, "All read", { unread: 0 });
});

router.post("/notifications/:id/read", requireUser, async (req, res) => {
  if (isId(req.params.id)) await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { read: true });
  return successResponse(res, "Read");
});

// ================= watch history =================

router.get("/me/history", requireUser, async (req, res) => {
  const { page, limit } = pageOf(req, 24, 60);
  const rows = await WatchHistory.find({ user: req.user._id })
    .sort({ watchedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate({ path: "video", populate: { path: "channel" } });
  const total = await WatchHistory.countDocuments({ user: req.user._id });
  return successResponse(res, "History", {
    items: rows
      .filter((row) => row.video && row.video.status === "published")
      .map((row) => ({ watchedAt: row.watchedAt, video: publicVideo(row.video) })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

router.delete("/me/history", requireUser, async (req, res) => {
  await WatchHistory.deleteMany({ user: req.user._id });
  return successResponse(res, "History cleared");
});

router.delete("/me/history/:videoId", requireUser, async (req, res) => {
  if (isId(req.params.videoId)) await WatchHistory.deleteOne({ user: req.user._id, video: req.params.videoId });
  return successResponse(res, "Removed from history");
});

// ================= playlists =================

const playlistShape = (playlist, { withVideos = false } = {}) => {
  const visible = (playlist.videos || []).filter((v) => !v?.status || (v.status === "published" && v.visibility !== "private"));
  const firstThumb = visible.find((v) => v?.thumbnail?.url)?.thumbnail?.url || null;
  return {
    id: playlist._id,
    kind: playlist.kind,
    title: playlist.title,
    description: playlist.description,
    visibility: playlist.visibility,
    videoCount: playlist.videos?.length || 0,
    thumbnail: firstThumb,
    updatedAt: playlist.updatedAt,
    ...(withVideos ? { videos: visible.filter((v) => v?._id && v.channel).map((v) => publicVideo(v)) } : {}),
  };
};

const watchLater = async (userId) => {
  let list = await Playlist.findOne({ owner: userId, kind: "watch_later" });
  if (!list) list = await Playlist.create({ owner: userId, kind: "watch_later", title: "Watch later", visibility: "private" });
  return list;
};

router.get("/me/playlists", requireUser, async (req, res) => {
  await watchLater(req.user._id);
  const lists = await Playlist.find({ owner: req.user._id }).sort({ kind: -1, updatedAt: -1 }).populate("videos", "thumbnail status visibility");
  const videoId = isId(req.query.video) ? String(req.query.video) : null;
  return successResponse(res, "Playlists", {
    playlists: lists.map((list) => ({
      ...playlistShape(list),
      hasVideo: videoId ? list.videos.some((v) => String(v?._id || v) === videoId) : undefined,
    })),
  });
});

router.post("/playlists", requireUser, async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) return errorResponse(res, "Give the playlist a name", 400);
  const visibility = ["public", "unlisted", "private"].includes(req.body?.visibility) ? req.body.visibility : "private";
  const list = await Playlist.create({ owner: req.user._id, title: title.slice(0, 150), visibility, description: String(req.body?.description || "").slice(0, 2000) });
  if (isId(req.body?.video)) {
    list.videos.push(req.body.video);
    await list.save();
  }
  return successResponse(res, "Playlist created", { playlist: playlistShape(list) }, 201);
});

const ownPlaylist = async (req, res) => {
  const list = isId(req.params.id) ? await Playlist.findOne({ _id: req.params.id, owner: req.user._id }) : null;
  if (!list) errorResponse(res, "Playlist not found", 404);
  return list;
};

router.patch("/playlists/:id", requireUser, async (req, res) => {
  const list = await ownPlaylist(req, res);
  if (!list) return undefined;
  if (list.kind === "custom") {
    if (typeof req.body?.title === "string" && req.body.title.trim()) list.title = req.body.title.trim().slice(0, 150);
    if (typeof req.body?.description === "string") list.description = req.body.description.slice(0, 2000);
    if (["public", "unlisted", "private"].includes(req.body?.visibility)) list.visibility = req.body.visibility;
  }
  await list.save();
  return successResponse(res, "Playlist saved", { playlist: playlistShape(list) });
});

router.delete("/playlists/:id", requireUser, async (req, res) => {
  const list = await ownPlaylist(req, res);
  if (!list) return undefined;
  if (list.kind === "watch_later") return errorResponse(res, "Watch later can't be deleted", 400);
  await list.deleteOne();
  return successResponse(res, "Playlist deleted");
});

// Add or remove one video (toggle unless `add` is given).
router.post("/playlists/:id/videos", requireUser, async (req, res) => {
  const list = req.params.id === "watch-later" ? await watchLater(req.user._id) : await ownPlaylist(req, res);
  if (!list) return undefined;
  const videoId = req.body?.video;
  if (!(await findWatchable(videoId))) return errorResponse(res, "Video not found", 404);

  const has = list.videos.some((v) => String(v) === String(videoId));
  const add = req.body?.add === undefined ? !has : Boolean(req.body.add);
  if (add && !has) list.videos.unshift(videoId);
  if (!add && has) list.videos = list.videos.filter((v) => String(v) !== String(videoId));
  await list.save();
  return successResponse(res, add ? `Saved to ${list.title}` : `Removed from ${list.title}`, { hasVideo: add, videoCount: list.videos.length });
});

router.get("/playlists/:id", optionalUser, async (req, res) => {
  if (!isId(req.params.id)) return errorResponse(res, "Playlist not found", 404);
  const list = await Playlist.findById(req.params.id).populate({ path: "videos", populate: { path: "channel" } });
  const isOwner = list && req.user && String(list.owner) === String(req.user._id);
  if (!list || (list.visibility === "private" && !isOwner)) return errorResponse(res, "Playlist not found", 404);
  const ownerChannel = await Channel.findOne({ owner: list.owner });
  return successResponse(res, "Playlist", {
    playlist: { ...playlistShape(list, { withVideos: true }), isOwner: Boolean(isOwner), channel: ownerChannel ? channelSummary(ownerChannel) : null },
  });
});

// Public playlists a channel's owner made (channel page → Playlists).
router.get("/channels/:id/playlists", async (req, res) => {
  const channel = isId(req.params.id) ? await Channel.findById(req.params.id) : null;
  if (!channel) return errorResponse(res, "Channel not found", 404);
  const lists = await Playlist.find({ owner: channel.owner, kind: "custom", visibility: "public" }).sort({ updatedAt: -1 }).populate("videos", "thumbnail status visibility");
  return successResponse(res, "Playlists", { playlists: lists.map((list) => playlistShape(list)) });
});

export default router;
