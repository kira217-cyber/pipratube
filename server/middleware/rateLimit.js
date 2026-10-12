import { rateLimit } from "express-rate-limit";

// Sign-in / sign-up: 20 tries per 15 minutes from one address, so
// passwords can't be guessed by brute force. Successful sign-ins don't count.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: "Too many attempts. Please wait a few minutes and try again." },
});

export default authLimiter;
