import express from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

import User from "../models/User.js";
import Channel from "../models/Channel.js";
import { requireUser, signUserToken } from "../middleware/auth.js";
import { imageUpload, storeImage, removeStored } from "../config/uploads.js";
import { handleUpload } from "../utils/handleUpload.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { publicUser, publicChannel } from "../utils/serialize.js";

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Bangladeshi mobile numbers, with or without +88 / 88.
const normalizePhone = (raw) => {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  const local = digits.startsWith("880") ? digits.slice(2) : digits;
  return /^01[3-9]\d{8}$/.test(local) ? local : null;
};

const session = async (user) => {
  const channel = await Channel.findOne({ owner: user._id });
  return { token: signUserToken(user), user: publicUser(user), channel: channel ? publicChannel(channel) : null };
};

router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};

    if (!name?.trim()) return errorResponse(res, "Please enter your name", 400);
    if (!email && !phone) return errorResponse(res, "Enter an email or a phone number", 400);
    if (!password || password.length < 6) return errorResponse(res, "Password must be at least 6 characters", 400);

    const cleanEmail = email ? String(email).trim().toLowerCase() : undefined;
    if (cleanEmail && !EMAIL_RE.test(cleanEmail)) return errorResponse(res, "That email doesn't look right", 400);

    const cleanPhone = phone ? normalizePhone(phone) : undefined;
    if (phone && !cleanPhone) return errorResponse(res, "Enter a valid Bangladeshi mobile number (01XXXXXXXXX)", 400);

    const taken = await User.findOne({
      $or: [cleanEmail && { email: cleanEmail }, cleanPhone && { phone: cleanPhone }].filter(Boolean),
    });
    if (taken) {
      return errorResponse(
        res,
        taken.email && taken.email === cleanEmail ? "This email is already registered" : "This phone number is already registered",
        409,
      );
    }

    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      password: await bcrypt.hash(password, 10),
    });

    return successResponse(res, "Account created", await session(user), 201);
  } catch (error) {
    if (error?.code === 11000) return errorResponse(res, "This email or phone is already registered", 409);
    return errorResponse(res, error.message, 500);
  }
});

router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) return errorResponse(res, "Enter your email/phone and password", 400);

    const value = String(identifier).trim();
    const phone = normalizePhone(value);
    const user = await User.findOne(phone ? { phone } : { email: value.toLowerCase() }).select("+password");

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return errorResponse(res, "Wrong email/phone or password", 401);
    }
    if (user.status === "blocked") return errorResponse(res, "This account has been blocked", 403);

    user.lastLoginAt = new Date();
    await user.save();

    return successResponse(res, "Signed in", await session(user));
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// ---------- Hand-off between PipraTube and PipraTube Studio ----------
// The site and Studio live on different domains, so they can't share a
// login. The signed-in side asks for a one-time code (valid 60 seconds),
// sends the browser to the other side with it, and that side trades the
// code for its own session — the token itself never appears in a URL.
const HANDOFF_TTL_MS = 60 * 1000;
const handoffs = new Map(); // code → { userId, expires }

const sweepHandoffs = () => {
  const now = Date.now();
  for (const [code, entry] of handoffs) if (entry.expires < now) handoffs.delete(code);
};

router.post("/handoff", requireUser, (req, res) => {
  sweepHandoffs();
  const code = crypto.randomBytes(24).toString("base64url");
  handoffs.set(code, { userId: String(req.user._id), expires: Date.now() + HANDOFF_TTL_MS });
  return successResponse(res, "Hand-off code", { code, expiresIn: HANDOFF_TTL_MS / 1000 });
});

router.post("/handoff/redeem", async (req, res) => {
  sweepHandoffs();
  const code = String(req.body?.code || "");
  const entry = handoffs.get(code);
  handoffs.delete(code); // single use, even when it fails
  if (!entry) return errorResponse(res, "This sign-in link has expired. Please sign in again.", 401);
  const user = await User.findById(entry.userId);
  if (!user || user.status === "blocked") return errorResponse(res, "This account can't sign in", 403);
  return successResponse(res, "Signed in", await session(user));
});

router.get("/me", requireUser, async (req, res) => {
  const channel = await Channel.findOne({ owner: req.user._id });
  return successResponse(res, "Profile", { user: publicUser(req.user), channel: channel ? publicChannel(channel) : null });
});

// Name / email / phone / avatar. Changing email or phone needs the password.
router.patch("/me", requireUser, handleUpload(imageUpload.single("avatar")), async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+password");
    const { name, email, phone, currentPassword } = req.body || {};

    if (typeof name === "string" && name.trim()) user.name = name.trim().slice(0, 80);

    const nextEmail = typeof email === "string" ? email.trim().toLowerCase() || undefined : user.email;
    const nextPhone = typeof phone === "string" ? (phone.trim() ? normalizePhone(phone) : undefined) : user.phone;
    if (typeof phone === "string" && phone.trim() && !nextPhone) {
      return errorResponse(res, "Enter a valid Bangladeshi mobile number (01XXXXXXXXX)", 400);
    }
    if (nextEmail && !EMAIL_RE.test(nextEmail)) return errorResponse(res, "That email doesn't look right", 400);

    const credentialsChanged = nextEmail !== user.email || nextPhone !== user.phone;
    if (credentialsChanged) {
      if (!nextEmail && !nextPhone) return errorResponse(res, "Keep at least an email or a phone number", 400);
      if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
        return errorResponse(res, "Enter your current password to change email or phone", 400);
      }
      user.email = nextEmail;
      user.phone = nextPhone;
    }

    if (req.file) {
      const previous = user.avatar?.fileName;
      user.avatar = await storeImage(req.file, "avatar");
      removeStored(previous);
    }

    await user.save();
    return successResponse(res, "Profile updated", { user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) return errorResponse(res, "That email or phone is used by another account", 409);
    return errorResponse(res, error.message, 500);
  }
});

router.post("/password", requireUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) return errorResponse(res, "New password must be at least 6 characters", 400);

    const user = await User.findById(req.user._id).select("+password");
    if (!(await bcrypt.compare(currentPassword || "", user.password))) {
      return errorResponse(res, "Current password is wrong", 400);
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.tokenVersion = (user.tokenVersion || 0) + 1; // signs out other devices
    await user.save();

    return successResponse(res, "Password changed", { token: signUserToken(user) });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

export default router;
