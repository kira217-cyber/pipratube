import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

import Admin from "../models/Admin.js";
import User from "../models/User.js";
import Channel from "../models/Channel.js";

// Live "who's on the site right now" for the admin dashboard. Nothing is
// stored — it lives in memory and resets when the server restarts.
//
//   /analytics-feed   every open client tab (signed in or guest)
//   /analytics-admin  admin dashboards, which receive snapshots + activity
const sessions = new Map(); // socket.id -> session
const recentActions = [];
const MAX_RECENT_ACTIONS = 100;

const clip = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");

const snapshot = () => {
  const videos = new Map();
  const liveTv = new Map();
  const pages = new Map();
  let members = 0;
  let guests = 0;
  const list = [];

  sessions.forEach((s) => {
    if (s.role === "member") members += 1;
    else guests += 1;
    if (s.watching) {
      const bucket = s.watching.type === "liveTv" ? liveTv : videos;
      const entry = bucket.get(s.watching.id) || { id: s.watching.id, title: s.watching.title, viewers: 0 };
      entry.viewers += 1;
      entry.title = s.watching.title || entry.title;
      bucket.set(s.watching.id, entry);
    }
    if (s.path) pages.set(s.path, (pages.get(s.path) || 0) + 1);
    list.push({ sessionId: s.sessionId, role: s.role, label: s.label, device: s.device, watching: s.watching, path: s.path, connectedAt: s.connectedAt });
  });

  const byViewers = (a, b) => b.viewers - a.viewers;
  return {
    online: sessions.size,
    members,
    guests,
    videos: [...videos.values()].sort(byViewers),
    liveTv: [...liveTv.values()].sort(byViewers),
    pages: [...pages.entries()].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 15),
    sessions: list.sort((a, b) => a.connectedAt - b.connectedAt),
    generatedAt: Date.now(),
  };
};

export const attachAnalytics = (io) => {
  const admins = io.of("/analytics-admin");
  const feed = io.of("/analytics-feed");

  // Snapshots are throttled so a burst of navigation doesn't flood admins.
  let pending = null;
  const broadcast = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      admins.emit("snapshot", snapshot());
    }, 400);
  };

  admins.use(async (socket, next) => {
    try {
      const decoded = jwt.verify(socket.handshake.auth?.token || "", process.env.ADMIN_JWT_SECRET);
      const admin = decoded.kind === "admin" ? await Admin.findById(decoded.id) : null;
      if (!admin || admin.status !== "active" || decoded.v !== (admin.tokenVersion || 0)) return next(new Error("Not authorized"));
      if (admin.role !== "super" && !admin.permissions.includes("dashboard")) return next(new Error("Not authorized"));
      next();
    } catch {
      next(new Error("Not authorized"));
    }
  });

  admins.on("connection", (socket) => {
    socket.emit("snapshot", snapshot());
    socket.emit("activityHistory", recentActions);
  });

  feed.use(async (socket, next) => {
    const { token, visitorId, device } = socket.handshake.auth || {};
    socket.data.device = clip(device, 20) || "web";
    socket.data.role = "guest";
    socket.data.label = visitorId ? `Guest ${String(visitorId).slice(0, 6).toUpperCase()}` : "Guest";
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = decoded.kind === "user" ? await User.findById(decoded.id).select("name") : null;
        if (user) {
          const channel = await Channel.findOne({ owner: user._id }).select("name handle");
          socket.data.role = "member";
          socket.data.label = channel ? `${channel.name} (@${channel.handle})` : user.name;
        }
      } catch {
        // Stale token — count them as a guest.
      }
    }
    next();
  });

  feed.on("connection", (socket) => {
    const session = {
      sessionId: randomUUID(),
      role: socket.data.role,
      label: socket.data.label,
      device: socket.data.device,
      watching: null,
      path: null,
      connectedAt: Date.now(),
    };
    sessions.set(socket.id, session);
    broadcast();

    socket.on("watch:start", (payload) => {
      const id = payload?.id ? String(payload.id) : null;
      if (!id) return;
      session.watching = { type: payload?.type === "liveTv" ? "liveTv" : "video", id, title: clip(payload?.title, 150) };
      broadcast();
    });

    socket.on("watch:stop", () => {
      session.watching = null;
      broadcast();
    });

    socket.on("page:view", (payload) => {
      session.path = clip(payload?.path, 200) || null;
      broadcast();
    });

    socket.on("user:action", (payload) => {
      const entry = {
        sessionId: session.sessionId,
        role: session.role,
        label: session.label,
        action: clip(payload?.action, 80) || "Action",
        meta: clip(payload?.meta, 120),
        path: session.path,
        at: Date.now(),
      };
      recentActions.unshift(entry);
      if (recentActions.length > MAX_RECENT_ACTIONS) recentActions.length = MAX_RECENT_ACTIONS;
      admins.emit("activity", entry);
    });

    socket.on("disconnect", () => {
      sessions.delete(socket.id);
      broadcast();
    });
  });
};

export default attachAnalytics;
