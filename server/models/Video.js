import mongoose from "mongoose";

import { mediaSchema } from "./media.js";

export const VIDEO_CATEGORIES = [
  "Movie",
  "Natok",
  "Drama",
  "Music",
  "Comedy",
  "Action",
  "Romance",
  "Horror",
  "Thriller",
  "Sports",
  "News",
  "Kids",
  "Education",
  "Documentary",
  "Gaming",
  "Lifestyle",
  "Religion",
  "Other",
];

// Anything this long or shorter is a Short — portrait or landscape alike.
export const SHORT_MAX_SECONDS = 120;

export const VISIBILITIES = ["public", "unlisted", "private"];


// A video's file and length are known once processing is done.
function isReady() {
  return !["processing", "failed"].includes(this.status);
}

const videoSchema = new mongoose.Schema(
  {
    channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 5000, default: "" },
    tags: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
    category: { type: String, enum: VIDEO_CATEGORIES, default: "Other" },

    thumbnail: { type: mediaSchema, default: () => ({}) },
    file: {
      provider: { type: String, enum: ["storage", "stream"], default: "storage" },
      // Empty while a new upload is still being processed.
      url: { type: String, required: isReady },
      fileName: { type: String, default: null },
      streamId: { type: String, default: null }, // Bunny Stream video guid
      fallbackUrl: { type: String, default: null }, // Bunny Stream's MP4 copy (previews, downloads)
      size: { type: Number, default: 0 },
      mimeType: { type: String, default: null },
    },

    durationSeconds: { type: Number, required: isReady, min: 0, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    isShort: { type: Boolean, default: false, index: true },

    visibility: { type: String, enum: VISIBILITIES, default: "public" },
    // Uploads publish at once; a future date schedules the video.
    publishedAt: { type: Date, default: Date.now, index: true },
    allowComments: { type: Boolean, default: true },
    madeForKids: { type: Boolean, default: false },

    // "removed" = taken down by an admin (hidden everywhere, kept for audit).
    // "processing" = uploaded, being converted / saved (only its creator sees it);
    // "failed" = processing didn't work (see processing.error).
    status: { type: String, enum: ["published", "removed", "processing", "failed"], default: "published" },
    removedReason: { type: String, default: null },
    processing: {
      stage: { type: String, default: null }, // checking | converting | saving | done | failed
      percent: { type: Number, default: 0 },
      error: { type: String, default: null },
      source: { type: String, default: null }, // the uploaded file on this server, until processed
      originalName: { type: String, default: null },
    },

    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
  },
  { timestamps: true },
);

videoSchema.pre("validate", function setShortFlag() {
  this.isShort = this.durationSeconds > 0 && this.durationSeconds <= SHORT_MAX_SECONDS;
});

videoSchema.index({ status: 1, visibility: 1, publishedAt: -1 });
videoSchema.index({ title: "text", description: "text", tags: "text" });

const Video = mongoose.model("Video", videoSchema);

export default Video;
