import mongoose from "mongoose";

import { mediaSchema } from "./media.js";

// One account type for everyone (YouTube-style): watch, like, comment,
// subscribe — and optionally own one channel (see Channel.owner).
// A user signs up with an email, a phone number, or both.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, lowercase: true, trim: true, default: undefined },
    phone: { type: String, trim: true, default: undefined },
    password: { type: String, required: true, select: false },
    avatar: { type: mediaSchema, default: () => ({}) },
    phoneVerified: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "blocked"], default: "active" },
    // Bumped on password change / block so every older token stops working.
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Unique only when present — partial indexes let an account have just one
// of the two.
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: "string" } } });

const User = mongoose.model("User", userSchema);

export default User;
