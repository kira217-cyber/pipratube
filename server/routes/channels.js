import express from "express";
import mongoose from "mongoose";

import Channel, { CHANNEL_CATEGORIES } from "../models/Channel.js";
import Video from "../models/Video.js";
import { optionalUser, requireUser } from "../middleware/auth.js";
import { Subscription } from "../models/Engagement.js";
import { imageUpload, storeImage, removeStored } from "../config/uploads.js";
import { handleUpload } from "../utils/handleUpload.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { publicChannel, channelSummary } from "../utils/serialize.js";
import { searchWords } from "../utils/search.js";

const router = express.Router();

const HANDLE_RE = /^[a-z0-9._]{3,30}$/;
const RESERVED = new Set(["admin", "api", "studio", "shorts", "live", "watch", "login", "register", "pipratv", "support"]);

const cleanHandle = (raw) => String(raw || "").trim().replace(/^@/, "").toLowerCase();

const handleProblem = async (handle, exceptId) => {
  if (!HANDLE_RE.test(handle)) return "Handles are 3–30 letters, numbers, dots or underscores";
  if (RESERVED.has(handle)) return "That handle is reserved";
  const taken = await Channel.findOne({ handle, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
  return taken ? "That handle is already taken" : null;
};

const parseLinks = (raw) => {
  if (raw === undefined) return undefined;
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(list)) return [];
    return list
      .filter((link) => link?.url && /^https?:\/\//i.test(link.url))
      .slice(0, 10)
      .map((link) => ({ title: String(link.title || "").slice(0, 40), url: String(link.url).slice(0, 300) }));
  } catch {
    return [];
  }
};

const applyFields = (channel, body) => {
  const { name, description, category, language, country, contactEmail } = body;
  if (typeof name === "string" && name.trim()) channel.name = name.trim().slice(0, 60);
  if (typeof description === "string") channel.description = description.slice(0, 1000);
  if (category && CHANNEL_CATEGORIES.includes(category)) channel.category = category;
  if (typeof language === "string") channel.language = language.slice(0, 30);
  if (typeof country === "string") channel.country = country.slice(0, 40);
  if (typeof contactEmail === "string") channel.contactEmail = contactEmail.trim().toLowerCase().slice(0, 120);
  const links = parseLinks(body.links);
  if (links !== undefined) channel.links = links;
};

const brandingFields = handleUpload(
  imageUpload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
);

const applyBranding = async (channel, files = {}) => {
  for (const key of ["avatar", "banner"]) {
    const file = files[key]?.[0];
    if (!file) continue;
    const previous = channel[key]?.fileName;
    channel[key] = await storeImage(file, `channel-${key}`, { screen: true });
    removeStored(previous);
  }
};

// ---- the signed-in user's own channel ----

router.get("/handle-available", requireUser, async (req, res) => {
  const handle = cleanHandle(req.query.handle);
  const mine = await Channel.findOne({ owner: req.user._id });
  const problem = await handleProblem(handle, mine?._id);
  return successResponse(res, "Checked", { handle, available: !problem, reason: problem });
});

router.post("/", requireUser, brandingFields, async (req, res) => {
  try {
    if (await Channel.exists({ owner: req.user._id })) {
      return errorResponse(res, "You already have a channel", 409);
    }

    const name = String(req.body?.name || "").trim();
    if (!name) return errorResponse(res, "Give your channel a name", 400);

    const handle = cleanHandle(req.body?.handle);
    const problem = await handleProblem(handle);
    if (problem) return errorResponse(res, problem, 400);

    const channel = new Channel({ owner: req.user._id, name, handle });
    applyFields(channel, req.body || {});
    await applyBranding(channel, req.files);
    await channel.save();

    return successResponse(res, "Channel created", { channel: publicChannel(channel) }, 201);
  } catch (error) {
    if (error?.code === 11000) return errorResponse(res, "That handle is already taken", 409);
    return errorResponse(res, error.message, error.status || 500);
  }
});

router.get("/me", requireUser, async (req, res) => {
  const channel = await Channel.findOne({ owner: req.user._id });
  return successResponse(res, "Channel", { channel: channel ? publicChannel(channel) : null });
});

router.patch("/me", requireUser, brandingFields, async (req, res) => {
  try {
    const channel = await Channel.findOne({ owner: req.user._id });
    if (!channel) return errorResponse(res, "Create your channel first", 404);

    if (req.body?.handle !== undefined) {
      const handle = cleanHandle(req.body.handle);
      if (handle !== channel.handle) {
        const problem = await handleProblem(handle, channel._id);
        if (problem) return errorResponse(res, problem, 400);
        channel.handle = handle;
      }
    }

    applyFields(channel, req.body || {});
    await applyBranding(channel, req.files);

    for (const key of ["avatar", "banner"]) {
      if (req.body?.[`remove_${key}`] === "1") {
        removeStored(channel[key]?.fileName);
        channel[key] = {};
      }
    }

    await channel.save();
    return successResponse(res, "Channel updated", { channel: publicChannel(channel) });
  } catch (error) {
    if (error?.code === 11000) return errorResponse(res, "That handle is already taken", 409);
    return errorResponse(res, error.message, error.status || 500);
  }
});

// ---- public ----

router.get("/", async (req, res) => {
  try {
    const { search, page: p, limit: l, sort } = req.query;
    const filter = { status: "active" };
    if (typeof search === "string" && search.trim()) {
      // Any word of the query in the channel's name or handle.
      const patterns = searchWords(search).map((word) => new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
      filter.$or = patterns.length ? patterns.flatMap((pattern) => [{ name: pattern }, { handle: pattern }]) : [{ _id: null }];
    }
    const page = Math.max(1, parseInt(p, 10) || 1);
    const limit = Math.min(60, Math.max(1, parseInt(l, 10) || 24));
    const order = sort === "new" ? { createdAt: -1 } : { subscriberCount: -1, totalViews: -1 };

    const [channels, total] = await Promise.all([
      Channel.find(filter).sort(order).skip((page - 1) * limit).limit(limit),
      Channel.countDocuments(filter),
    ]);

    return successResponse(res, "Channels", {
      channels: channels.map(channelSummary),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// By id or by @handle.
router.get("/:idOrHandle", optionalUser, async (req, res) => {
  try {
    const key = req.params.idOrHandle;
    const channel = mongoose.isValidObjectId(key)
      ? await Channel.findById(key)
      : await Channel.findOne({ handle: cleanHandle(key) });

    if (!channel || channel.status !== "active") return errorResponse(res, "Channel not found", 404);

    const [shortCount, longCount] = await Promise.all([
      Video.countDocuments({ channel: channel._id, status: "published", visibility: "public", isShort: true, publishedAt: { $lte: new Date() } }),
      Video.countDocuments({ channel: channel._id, status: "published", visibility: "public", isShort: false, publishedAt: { $lte: new Date() } }),
    ]);

    const sub = req.user ? await Subscription.findOne({ subscriber: req.user._id, channel: channel._id }) : null;
    const viewer = req.user
      ? { subscribed: Boolean(sub), notify: sub?.notify || null, isOwner: String(channel.owner) === String(req.user._id) }
      : null;

    return successResponse(res, "Channel", { channel: { ...publicChannel(channel), shortCount, longCount }, viewer });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

export default router;
