import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// Like (+1) or dislike (-1) on a video — one per user per video.
const reactionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    video: { type: ObjectId, ref: "Video", required: true, index: true },
    value: { type: Number, enum: [1, -1], required: true },
  },
  { timestamps: true },
);
reactionSchema.index({ user: 1, video: 1 }, { unique: true });
reactionSchema.index({ user: 1, value: 1, updatedAt: -1 });
export const Reaction = mongoose.model("Reaction", reactionSchema);

// A comment, or a reply to one (`parent`). Replies are one level deep,
// like YouTube.
const commentSchema = new mongoose.Schema(
  {
    video: { type: ObjectId, ref: "Video", required: true, index: true },
    user: { type: ObjectId, ref: "User", required: true, index: true },
    parent: { type: ObjectId, ref: "Comment", default: null, index: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    likes: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    pinned: { type: Boolean, default: false },
    hearted: { type: Boolean, default: false },
    edited: { type: Boolean, default: false },
    // "removed" = hidden by an admin.
    status: { type: String, enum: ["visible", "removed"], default: "visible" },
  },
  { timestamps: true },
);
commentSchema.index({ video: 1, parent: 1, pinned: -1, likes: -1, createdAt: -1 });
export const Comment = mongoose.model("Comment", commentSchema);

const commentLikeSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    comment: { type: ObjectId, ref: "Comment", required: true, index: true },
  },
  { timestamps: true },
);
commentLikeSchema.index({ user: 1, comment: 1 }, { unique: true });
export const CommentLike = mongoose.model("CommentLike", commentLikeSchema);

// A user subscribed to a channel. `notify`: "all" rings the bell for new
// uploads, "none" doesn't.
const subscriptionSchema = new mongoose.Schema(
  {
    subscriber: { type: ObjectId, ref: "User", required: true, index: true },
    channel: { type: ObjectId, ref: "Channel", required: true, index: true },
    notify: { type: String, enum: ["all", "none"], default: "all" },
  },
  { timestamps: true },
);
subscriptionSchema.index({ subscriber: 1, channel: 1 }, { unique: true });
export const Subscription = mongoose.model("Subscription", subscriptionSchema);

export const NOTIFICATION_TYPES = ["new_video", "comment", "reply", "subscriber", "heart"];

const notificationSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true, index: true }, // recipient
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    actor: { type: ObjectId, ref: "User", default: null },
    channel: { type: ObjectId, ref: "Channel", default: null },
    video: { type: ObjectId, ref: "Video", default: null },
    comment: { type: ObjectId, ref: "Comment", default: null },
    text: { type: String, default: "", maxlength: 300 },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });
// Old notifications clean themselves up after 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
export const Notification = mongoose.model("Notification", notificationSchema);

// What a signed-in user watched, most recent first.
const historySchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    video: { type: ObjectId, ref: "Video", required: true },
    watchedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);
historySchema.index({ user: 1, video: 1 }, { unique: true });
historySchema.index({ user: 1, watchedAt: -1 });
export const WatchHistory = mongoose.model("WatchHistory", historySchema);

// User playlists. Each user also gets one "watch_later" list, made on demand.
const playlistSchema = new mongoose.Schema(
  {
    owner: { type: ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["custom", "watch_later"], default: "custom" },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    visibility: { type: String, enum: ["public", "unlisted", "private"], default: "private" },
    videos: { type: [{ type: ObjectId, ref: "Video" }], default: [] },
  },
  { timestamps: true },
);
playlistSchema.index({ owner: 1, kind: 1 });
export const Playlist = mongoose.model("Playlist", playlistSchema);
