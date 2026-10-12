import mongoose from "mongoose";

import { mediaSchema } from "./media.js";


const linkSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 40, default: "" },
    url: { type: String, trim: true, required: true, maxlength: 300 },
  },
  { _id: false },
);

export const CHANNEL_CATEGORIES = [
  "Entertainment",
  "Movies",
  "Natok & Drama",
  "Music",
  "Kids",
  "Sports",
  "News",
  "Education",
  "Comedy",
  "Gaming",
  "Lifestyle",
  "Food",
  "Travel",
  "Tech",
  "Religion",
  "Other",
];

// A creator channel. Each user may own exactly one (unique `owner`).
const channelSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    // "@handle" without the "@", lowercase; unique across the site.
    handle: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 30 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    avatar: { type: mediaSchema, default: () => ({}) },
    banner: { type: mediaSchema, default: () => ({}) },
    links: { type: [linkSchema], default: [] },
    category: { type: String, enum: CHANNEL_CATEGORIES, default: "Entertainment" },
    language: { type: String, trim: true, maxlength: 30, default: "Bangla" },
    country: { type: String, trim: true, maxlength: 40, default: "Bangladesh" },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 120, default: "" },

    verified: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "suspended"], default: "active" },

    // Denormalised counters, kept in step by the routes that change them.
    subscriberCount: { type: Number, default: 0 },
    videoCount: { type: Number, default: 0 },
    totalViews: { type: Number, default: 0 },
  },
  { timestamps: true },
);


const Channel = mongoose.model("Channel", channelSchema);

export default Channel;
