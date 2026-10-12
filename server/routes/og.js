import express from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import sharp from "sharp";

import Video from "../models/Video.js";
import Channel from "../models/Channel.js";
import { Playlist } from "../models/Engagement.js";
import { apiBaseUrl, publicUrl, UPLOAD_DIR } from "../utils/localFiles.js";

// Link previews. Facebook, WhatsApp, Messenger, X, Telegram… don't run the
// React app, so when one of them asks for a page of pipratube.com, nginx
// sends it here instead (see deploy/nginx/pipratube.conf) and we answer
// with that page's title, description and picture:
//
//   /watch/:id, /shorts?v=:id  → the video's title, description, thumbnail
//   /@handle, /channel/:id     → the channel's name, description, avatar
//   /playlist/:id              → the playlist
//   anything else              → the PipraTube logo card
//
// Previews use a 1200×630 JPEG made from the thumbnail, the size and type
// every app shows reliably (some still skip WebP).

const router = express.Router();

const SITE_URL = (process.env.SITE_URL || "https://pipratube.com").replace(/\/$/, "");
const SITE_NAME = "PipraTube";
const DEFAULT = {
  title: "PipraTube – বাংলা নাটক, সিনেমা ও বিনোদন",
  description: "জনপ্রিয় বাংলা নাটক, সিনেমা, Shorts ও ২৪/৭ লাইভ টিভি — সব এক জায়গায়, ফ্রি।",
  image: `${SITE_URL}/og-logo.jpg`,
  imageWidth: 800,
  imageHeight: 800,
  type: "website",
  // Just the square PipraTube icon, shown small beside the title.
  card: "summary",
};

const OG_DIR = path.join(UPLOAD_DIR, "og");
fs.mkdirSync(OG_DIR, { recursive: true });

const escapeHtml = (text) =>
  String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clip = (text, max) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

const listable = (video) =>
  video && video.status === "published" && video.visibility !== "private" && video.publishedAt <= new Date() && video.channel?.status === "active";

// The picture behind a stored image URL, from disk or the web.
const readImage = async (url) => {
  if (!url) return null;
  if (url.startsWith("/uploads/")) {
    const file = path.resolve(UPLOAD_DIR, url.slice("/uploads/".length));
    if (!file.startsWith(UPLOAD_DIR + path.sep)) return null;
    return fsp.readFile(file).catch(() => null);
  }
  if (!/^https?:\/\//.test(url)) return null;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  return response?.ok ? Buffer.from(await response.arrayBuffer()) : null;
};

// GET /api/og/image/:kind/:id.jpg — a 1200×630 JPEG of a video thumbnail
// (or channel avatar/banner), made once and kept in uploads/og.
router.get("/image/:kind/:file", async (req, res) => {
  try {
    const id = req.params.file.replace(/\.jpg$/, "");
    if (!mongoose.isValidObjectId(id)) return res.status(404).end();
    let source = null;
    let square = false;
    if (req.params.kind === "video") {
      const video = await Video.findById(id).select("thumbnail");
      source = video?.thumbnail?.url;
    } else if (req.params.kind === "channel") {
      const channel = await Channel.findById(id).select("avatar banner");
      source = channel?.avatar?.url || channel?.banner?.url;
      square = Boolean(channel?.avatar?.url);
    }
    if (!source) return res.redirect(302, DEFAULT.image);

    const name = `${req.params.kind}-${id}-${createHash("sha1").update(source).digest("hex").slice(0, 10)}.jpg`;
    const cached = path.join(OG_DIR, name);
    if (!fs.existsSync(cached)) {
      const input = await readImage(source);
      if (!input) return res.redirect(302, DEFAULT.image);
      const size = square ? { width: 630, height: 630 } : { width: 1200, height: 630 };
      await sharp(input, { failOn: "none" })
        .rotate()
        .resize({ ...size, fit: "cover", position: "attention" })
        .flatten({ background: "#0b0f15" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(cached);
    }
    res.set("Cache-Control", "public, max-age=86400");
    return res.type("image/jpeg").sendFile(cached);
  } catch {
    return res.redirect(302, DEFAULT.image);
  }
});

const videoMeta = async (id, pageUrl) => {
  if (!mongoose.isValidObjectId(id)) return null;
  const video = await Video.findById(id).populate("channel", "name handle status");
  if (!listable(video)) return null;
  const by = video.channel?.name ? ` · ${video.channel.name}` : "";
  return {
    title: clip(video.title, 100),
    description: clip(video.description, 200) || `${video.title}${by} — PipraTube-এ দেখুন`,
    image: `${apiBaseUrl()}/api/og/image/video/${video._id}.jpg`,
    imageWidth: 1200,
    imageHeight: 630,
    imageAlt: clip(video.title, 100),
    type: "video.other",
    url: pageUrl,
    // A plain MP4 (Bunny Stream's MP4 copy, never its HLS playlist).
    video: (() => {
      const mp4 = video.file?.fallbackUrl || (video.file?.provider !== "stream" ? video.file?.url : null);
      return mp4 ? { url: mp4, width: video.width || 1280, height: video.height || 720 } : null;
    })(),
    duration: video.durationSeconds,
  };
};

const channelMeta = async (channel, pageUrl) => {
  if (!channel || channel.status !== "active") return null;
  return {
    title: `${clip(channel.name, 80)} – ${SITE_NAME}`,
    description: clip(channel.description, 200) || `@${channel.handle} — ${channel.name}-এর ভিডিও দেখুন PipraTube-এ`,
    image: channel.avatar?.url || channel.banner?.url ? `${apiBaseUrl()}/api/og/image/channel/${channel._id}.jpg` : DEFAULT.image,
    imageWidth: channel.avatar?.url ? 630 : 1200,
    imageHeight: 630,
    type: "profile",
    url: pageUrl,
    card: channel.avatar?.url ? "summary" : "summary_large_image",
  };
};

// What a page of the viewer site should look like when shared.
const metaFor = async (uri) => {
  const target = new URL(uri || "/", SITE_URL);
  const pathname = decodeURIComponent(target.pathname).replace(/\/+$/, "") || "/";
  const pageUrl = `${SITE_URL}${target.pathname}${target.search}`;

  let match = pathname.match(/^\/watch\/([^/]+)$/);
  if (match) return videoMeta(match[1], pageUrl);

  if (pathname === "/shorts" && target.searchParams.get("v")) return videoMeta(target.searchParams.get("v"), pageUrl);

  match = pathname.match(/^\/@([^/]+)$/);
  if (match) return channelMeta(await Channel.findOne({ handle: match[1].toLowerCase() }), pageUrl);

  match = pathname.match(/^\/channel\/([^/]+)$/);
  if (match && mongoose.isValidObjectId(match[1])) return channelMeta(await Channel.findById(match[1]), pageUrl);

  match = pathname.match(/^\/playlist\/([^/]+)$/);
  if (match && mongoose.isValidObjectId(match[1])) {
    const playlist = await Playlist.findById(match[1]).select("title description visibility videos");
    if (playlist && playlist.visibility !== "private") {
      const first = playlist.videos?.[0];
      return {
        title: `${clip(playlist.title, 90)} – ${SITE_NAME}`,
        description: clip(playlist.description, 200) || `${playlist.videos?.length || 0}টি ভিডিওর প্লেলিস্ট — PipraTube`,
        image: first ? `${apiBaseUrl()}/api/og/image/video/${first}.jpg` : DEFAULT.image,
        imageWidth: 1200,
        imageHeight: 630,
        type: "website",
        url: pageUrl,
      };
    }
  }

  if (pathname.startsWith("/live-tv")) {
    return { ...DEFAULT, title: "লাইভ টিভি – PipraTube", description: "২৪/৭ বাংলা লাইভ টিভি চ্যানেল দেখুন PipraTube-এ, ফ্রি।", url: pageUrl };
  }
  return { ...DEFAULT, url: pathname === "/" ? `${SITE_URL}/` : pageUrl };
};

const render = (meta) => {
  const m = { ...DEFAULT, ...meta };
  const tags = [
    ["property", "og:site_name", SITE_NAME],
    ["property", "og:type", m.type],
    ["property", "og:url", m.url],
    ["property", "og:title", m.title],
    ["property", "og:description", m.description],
    ["property", "og:image", m.image],
    ["property", "og:image:secure_url", m.image],
    ["property", "og:image:type", m.image.endsWith(".png") ? "image/png" : "image/jpeg"],
    ["property", "og:image:width", m.imageWidth],
    ["property", "og:image:height", m.imageHeight],
    ["property", "og:image:alt", m.imageAlt || m.title],
    ["property", "og:locale", "bn_BD"],
    ["name", "twitter:card", m.card || "summary_large_image"],
    ["name", "twitter:title", m.title],
    ["name", "twitter:description", m.description],
    ["name", "twitter:image", m.image],
    ["name", "description", m.description],
  ];
  if (m.video) {
    tags.push(
      ["property", "og:video", m.video.url],
      ["property", "og:video:secure_url", m.video.url],
      ["property", "og:video:type", "video/mp4"],
      ["property", "og:video:width", m.video.width],
      ["property", "og:video:height", m.video.height],
    );
  }
  if (m.duration) tags.push(["property", "video:duration", Math.round(m.duration)]);

  const head = tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`).join("\n    ");
  return `<!doctype html>
<html lang="bn">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(m.title)}</title>
    <link rel="canonical" href="${escapeHtml(m.url)}" />
    ${head}
    <link rel="icon" type="image/png" href="${SITE_URL}/favicon.png" />
  </head>
  <body>
    <h1>${escapeHtml(m.title)}</h1>
    <p>${escapeHtml(m.description)}</p>
    <p><a href="${escapeHtml(m.url)}">${escapeHtml(m.url)}</a></p>
  </body>
</html>`;
};

// GET /api/og — nginx passes the page's address in X-Original-URI
// (or ?path= when trying it by hand).
router.get("/", async (req, res) => {
  const uri = req.get("x-original-uri") || req.query.path || "/";
  let meta = null;
  try {
    meta = await metaFor(String(uri));
  } catch {
    meta = null;
  }
  res.set("Cache-Control", "public, max-age=300");
  res.type("html").send(render(meta || { ...DEFAULT, url: `${SITE_URL}/` }));
});

export default router;
