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
import { getAuthSetting, publicAuthOptions } from "../models/AuthSetting.js";
import { checkCode, sendCode } from "../utils/otp.js";
import { isFakeEmail } from "../utils/fakeAccounts.js";
import { otpLimiter, realIp, signupLimiter } from "../middleware/rateLimit.js";

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

// What the forms may offer (which methods, whether a code is needed).
router.get("/options", async (req, res) => {
  try {
    return successResponse(res, "Sign-in options", publicAuthOptions(await getAuthSetting()));
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Checks a sign-up target for `method` and returns its clean form, or an error.
const signupTarget = async (method, raw) => {
  if (method === "phone") {
    const phone = normalizePhone(raw);
    if (!phone) return { error: "Enter a valid Bangladeshi mobile number (01XXXXXXXXX)" };
    if (await User.exists({ phone })) return { error: "This phone number is already registered", status: 409 };
    return { target: phone };
  }
  const email = String(raw || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "That email doesn't look right" };
  if (isFakeEmail(email)) return { error: "Please use a real email address" };
  if (await User.exists({ email })) return { error: "This email is already registered", status: 409 };
  return { target: email };
};

const signupAllowed = (options, method) => {
  if (!options.registrationOpen) return "Sign-ups are closed right now. Please try again later.";
  if (!["phone", "email"].includes(method)) return "Choose phone or email";
  if (!options[method].register) return `Signing up with ${method === "phone" ? "a phone number" : "email"} isn't available right now`;
  return null;
};

// Sends the code that confirms the phone number / email before sign-up.
router.post("/otp/send", otpLimiter, async (req, res) => {
  try {
    const method = req.body?.method === "email" ? "email" : "phone";
    const options = publicAuthOptions(await getAuthSetting());
    const blocked = signupAllowed(options, method);
    if (blocked) return errorResponse(res, blocked, 403);
    if (!options[method].otp) return successResponse(res, "No code needed", { required: false });

    const { target, error, status } = await signupTarget(method, req.body?.target);
    if (error) return errorResponse(res, error, status || 400);

    const result = await sendCode({ purpose: "register", channel: method, target });
    if (!result.ok) return errorResponse(res, result.message, result.code === "otpWait" ? 429 : 400, result.code);
    return successResponse(res, result.message, { required: true });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.post("/register", signupLimiter, async (req, res) => {
  try {
    const { name, email, phone, password, otp } = req.body || {};
    const method = req.body?.method || (phone && !email ? "phone" : "email");
    const options = publicAuthOptions(await getAuthSetting());
    const blocked = signupAllowed(options, method);
    if (blocked) return errorResponse(res, blocked, 403);

    if (!String(name || "").trim()) return errorResponse(res, "Please enter your name", 400);
    if (!password || password.length < 6) return errorResponse(res, "Password must be at least 6 characters", 400);

    const { target, error, status } = await signupTarget(method, method === "phone" ? phone : email);
    if (error) return errorResponse(res, error, status || 400);

    // The code proves the number / address belongs to this person.
    if (options[method].otp) {
      if (!otp) return errorResponse(res, "Enter the code we sent you", 400, "otpRequired");
      const check = checkCode({ purpose: "register", channel: method, target, code: otp });
      if (!check.ok) return errorResponse(res, check.message, 400, check.code);
    }

    const user = await User.create({
      name: String(name).trim().slice(0, 80),
      ...(method === "phone" ? { phone: target, phoneVerified: options.phone.otp } : { email: target, emailVerified: options.email.otp }),
      password: await bcrypt.hash(password, 10),
      signupIp: realIp(req).slice(0, 64),
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
    const method = phone ? "phone" : "email";
    const options = publicAuthOptions(await getAuthSetting());
    if (!options[method].login) {
      return errorResponse(res, `Signing in with ${method === "phone" ? "a phone number" : "email"} is turned off. Please use your ${method === "phone" ? "email" : "phone number"}.`, 403);
    }

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
      user.avatar = await storeImage(req.file, "avatar", { screen: true });
      removeStored(previous);
    }

    await user.save();
    return successResponse(res, "Profile updated", { user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) return errorResponse(res, "That email or phone is used by another account", 409);
    return errorResponse(res, error.message, error.status || 500);
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
