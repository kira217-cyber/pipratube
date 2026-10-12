import "./config/env.js";

import http from "http";
import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import mongoose from "mongoose";

import connectDB from "./config/db.js";
import { checkProductionEnv, isProduction } from "./config/production.js";
import { authLimiter } from "./middleware/rateLimit.js";
import authRoutes from "./routes/auth.js";
import channelRoutes from "./routes/channels.js";
import studioRoutes from "./routes/studio.js";
import videoRoutes from "./routes/videos.js";
import siteRoutes from "./routes/site.js";
import adminRoutes from "./routes/admin.js";
import engagementRoutes from "./routes/engagement.js";
import { attachAnalytics } from "./sockets/analytics.js";
import adminContentRoutes from "./routes/adminContent.js";
import adminSiteRoutes from "./routes/adminSite.js";
import uploadRoutes from "./routes/uploads.js";
import ogRoutes from "./routes/og.js";
import bunnyWebhookRoutes from "./routes/bunnyWebhook.js";
import { startStreamWatcher } from "./utils/streamVideos.js";
import { resumePendingVideos } from "./utils/videoPipeline.js";
import { UPLOAD_DIR } from "./utils/localFiles.js";

checkProductionEnv();

const app = express();
const PORT = process.env.PORT || 5100;

// Behind nginx: trust its X-Forwarded-* headers (real visitor IP, https).
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
    // The site, Studio and admin live on other domains and load our images.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // This is a JSON API; the web apps set their own policies.
    contentSecurityPolicy: false,
  }),
);
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
// Images stored on this server (thumbnails, avatars, logos, banners).
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d", immutable: true, fallthrough: false }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => res.send("PipraTube API is running"));
app.get("/api/health", (req, res) =>
  res.json({ ok: true, db: mongoose.connection.readyState === 1 ? "up" : "down", time: new Date().toISOString() }),
);

// Slow down password guessing on every sign-in / sign-up door.
app.use(["/api/auth/login", "/api/auth/register", "/api/auth/handoff/redeem", "/api/admin/login"], authLimiter);

app.use("/api/og", ogRoutes);
app.use("/api/bunny", bunnyWebhookRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", engagementRoutes);
app.use("/api/channels", channelRoutes);
app.use("/api/studio", studioRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/site", siteRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminContentRoutes);
app.use("/api/admin/site", adminSiteRoutes);

app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  // Don't leak internals to visitors in production.
  const message = status >= 500 && isProduction() ? "Server error" : err.message || "Server error";
  res.status(status).json({ success: false, message });
});

await connectDB();
resumePendingVideos().catch((error) => console.error("Resuming video processing failed:", error.message));
startStreamWatcher();

// Live analytics (see sockets/analytics.js) shares the HTTP server.
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
attachAnalytics(io);

server.listen(PORT, () => console.log(`PipraTube API on port ${PORT} (${isProduction() ? "production" : "development"})`));

// PM2 / systemd stop or restart: finish in-flight requests, then exit.
const shutdown = (signal) => {
  console.log(`${signal} received — shutting down`);
  io.close();
  server.close(async () => {
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
