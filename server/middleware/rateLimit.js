import { ipKeyGenerator, rateLimit } from "express-rate-limit";

// The visitor's real address. The API sits behind Cloudflare and nginx, so
// req.ip alone can be a Cloudflare edge shared by thousands of people.
export const realIp = (req) => String(req.headers["cf-connecting-ip"] || req.headers["x-real-ip"] || req.ip || "").trim();
const byRealIp = (req) => ipKeyGenerator(realIp(req));

// Sign-in / sign-up: 20 tries per 15 minutes from one address, so
// passwords can't be guessed by brute force. Successful sign-ins don't count.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: byRealIp,
  message: { success: false, message: "Too many attempts. Please wait a few minutes and try again." },
});

// New accounts: at most 3 an hour from one address — successful ones count
// too, so a bot can't open thousands.
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: byRealIp,
  message: { success: false, message: "Too many new accounts from your connection. Please try again later." },
});

// Verification codes: 5 per 15 minutes from one address.
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: byRealIp,
  message: { success: false, message: "Too many code requests. Please wait a few minutes." },
});

export default authLimiter;
