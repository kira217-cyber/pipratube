import mongoose from "mongoose";

import { LIVE_TV_CATEGORY_KEYS } from "./liveTvCategories.js";
import { mediaSchema } from "./media.js";

const { ObjectId } = mongoose.Schema.Types;

const media = mediaSchema;

// ---------- Site-wide settings (one document) ----------
const siteSettingsSchema = new mongoose.Schema(
  {
    siteName: { type: String, default: "PipraTube", trim: true, maxlength: 60 },
    logo: { type: media, default: () => ({}) },
    favicon: { type: media, default: () => ({}) },
    socialLinks: {
      facebook: { type: String, default: "" },
      youtube: { type: String, default: "" },
      telegram: { type: String, default: "" },
      instagram: { type: String, default: "" },
      tiktok: { type: String, default: "" },
    },
    footerLinks: {
      type: [new mongoose.Schema({ label: { type: String, trim: true, maxlength: 40 }, url: { type: String, trim: true, maxlength: 300 } }, { _id: false })],
      default: [],
    },
    contactEmail: { type: String, default: "", trim: true },
    // A one-line notice across the top of the site (maintenance, events …).
    announcement: {
      text: { type: String, default: "", maxlength: 200 },
      url: { type: String, default: "" },
      enabled: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);
export const SiteSettings = mongoose.model("SiteSettings", siteSettingsSchema);

export const getSettings = async () => (await SiteSettings.findOne()) || SiteSettings.create({});

// ---------- What Home shows first (one document) ----------
const homeSectionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 80 },
  videos: { type: [{ type: ObjectId, ref: "Video" }], default: [] },
  enabled: { type: Boolean, default: true },
});

const homeConfigSchema = new mongoose.Schema(
  {
    // Shown at the very top of the Home feed, in this order.
    pinnedVideos: { type: [{ type: ObjectId, ref: "Video" }], default: [] },
    // Admin-made rows ("Eid special", "Top natok" …) between the feed items.
    sections: { type: [homeSectionSchema], default: [] },
    // Shorts that lead the Home Shorts shelf and the Shorts page.
    pinnedShorts: { type: [{ type: ObjectId, ref: "Video" }], default: [] },
    // Channels in the "Channels to watch" row (falls back to the biggest).
    featuredChannels: { type: [{ type: ObjectId, ref: "Channel" }], default: [] },
    // Feed order: a new random order on every visit, or newest first.
    shuffleVideos: { type: Boolean, default: true },
    shuffleShorts: { type: Boolean, default: true },
    // A Shorts row after every N videos in the feed.
    shortsEvery: { type: Number, default: 4, min: 2, max: 12 },
  },
  { timestamps: true },
);
export const HomeConfig = mongoose.model("HomeConfig", homeConfigSchema);

export const getHomeConfig = async () => (await HomeConfig.findOne()) || HomeConfig.create({});

// ---------- Ads ----------
// "banner": an image on Home (top card or inside the feed).
// "video": an in-player ad (pre/mid-roll) on videos and/or Live TV.
export const AD_PLACEMENTS = ["home_top", "home_feed"];

const adSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    kind: { type: String, enum: ["banner", "video"], required: true },
    placement: { type: String, enum: AD_PLACEMENTS, default: "home_top" },
    image: { type: media, default: () => ({}) },
    video: { type: media, default: () => ({}) },
    url: { type: String, default: "", trim: true },
    skipAfterSeconds: { type: Number, default: 5, min: 0, max: 60 },
    firstDelaySeconds: { type: Number, default: 0, min: 0 },
    intervalSeconds: { type: Number, default: 600, min: 30 },
    onVideos: { type: Boolean, default: true },
    onLiveTv: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
  },
  { timestamps: true },
);
adSchema.index({ kind: 1, enabled: 1 });
export const Ad = mongoose.model("Ad", adSchema);

// What sits in a corner of the Live TV player: the channel logo (instead
// of the site logo), or a short image / video ad that appears now and then.
// `channels` empty = every Live TV channel.
export const OVERLAY_KINDS = ["logo", "image", "video"];
export const OVERLAY_POSITIONS = ["top-right", "top-left", "bottom-right", "bottom-left"];
export const OVERLAY_SIZES = ["small", "medium", "large"];

const liveTvOverlaySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    kind: { type: String, enum: OVERLAY_KINDS, required: true },
    media: { type: mediaSchema, default: () => ({}) },
    channels: { type: [String], default: [] },
    position: { type: String, enum: OVERLAY_POSITIONS, default: "top-right" },
    size: { type: String, enum: OVERLAY_SIZES, default: "medium" },
    url: { type: String, default: "" },
    // Image / video ads: first shown after N seconds of watching, on screen
    // for `durationSeconds`, then again every `intervalSeconds`.
    firstDelaySeconds: { type: Number, default: 20, min: 0 },
    durationSeconds: { type: Number, default: 10, min: 3, max: 120 },
    intervalSeconds: { type: Number, default: 300, min: 30 },
    enabled: { type: Boolean, default: true },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
  },
  { timestamps: true },
);
export const LiveTvOverlay = mongoose.model("LiveTvOverlay", liveTvOverlaySchema);

export const activeAdFilter = (extra = {}) => {
  const now = new Date();
  return {
    enabled: true,
    $and: [
      { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
      { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
    ],
    ...extra,
  };
};

// ---------- Live TV (external streams) ----------
const liveTvChannelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    streamUrl: { type: String, required: true, trim: true },
    logo: { type: media, default: () => ({}) },
    categories: { type: [{ type: String, enum: LIVE_TV_CATEGORY_KEYS }], default: [] },
    showOnList: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
    homeFeatured: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
liveTvChannelSchema.index({ order: 1, createdAt: 1 });
export const LiveTvChannel = mongoose.model("LiveTvChannel", liveTvChannelSchema);

// ---------- PipraTV's own broadcast channel (one document) ----------
// Plays library videos on a clock, like real TV: a daily/dated schedule,
// and an "all time" loop for whenever nothing is scheduled. Every viewer
// sees the same moment (see utils/liveTvSchedule.js).
const slotSchema = new mongoose.Schema({
  video: { type: ObjectId, ref: "Video", required: true },
  startTime: { type: String, required: true, trim: true }, // "HH:mm", 24h, server time
  date: { type: String, default: null }, // "YYYY-MM-DD" one-off, or null = every day
});

const pipraChannelSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Pipra TV", trim: true, maxlength: 80 },
    logo: { type: media, default: () => ({}) },
    enabled: { type: Boolean, default: true },
    homeFeatured: { type: Boolean, default: true },
    pinned: { type: Boolean, default: true },
    categories: { type: [{ type: String, enum: LIVE_TV_CATEGORY_KEYS }], default: [] },
    loop: { type: [{ type: ObjectId, ref: "Video" }], default: [] },
    schedule: { type: [slotSchema], default: [] },
  },
  { timestamps: true },
);
export const PipraChannel = mongoose.model("PipraChannel", pipraChannelSchema);

export const getPipraChannel = async () => (await PipraChannel.findOne()) || PipraChannel.create({});
