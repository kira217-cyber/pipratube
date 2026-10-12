import { API_ORIGIN } from "../api/axios";

// Uploads are full CDN URLs and pass straight through; anything relative
// is served by the API itself.
export const mediaUrl = (path, width) => {
  if (!path) return null;
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  void width;
  return import.meta.env.DEV ? path : `${API_ORIGIN}${path}`;
};

// Standard sizes, so the same image is resized (and cached) only once.
export const IMG = { avatar: 160, logo: 240, card: 480, portrait: 360, hero: 1280 };

// 1234 → "1.2K", 3100000 → "3.1M"
export const formatCount = (value) => {
  const n = Number(value) || 0;
  if (n >= 1e9) return `${trim(n / 1e9)}B`;
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}K`;
  return String(n);
};

const trim = (n) => (n >= 100 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, ""));

const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export const timeAgo = (date) => {
  if (!date) return "";
  const seconds = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);

  for (const [unit, size] of UNITS) {
    const amount = Math.floor(seconds / size);
    if (amount >= 1) return `${amount} ${unit}${amount > 1 ? "s" : ""} ago`;
  }

  return "just now";
};

// "1 view", "5.4M views"
export const viewsText = (value) => `${formatCount(value)} ${Number(value) === 1 ? "view" : "views"}`;

// "5.4M views · 3 weeks ago", leaving out whichever half isn't known.
export const videoMeta = (video) =>
  [
    typeof video?.views === "number" ? viewsText(video.views) : null,
    video?.publishedAt || video?.createdAt ? timeAgo(video.publishedAt || video.createdAt) : null,
  ]
    .filter(Boolean)
    .join(" · ");

export const formatMoney = (value) =>
  `$${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Video id shape differs by endpoint: summaries use `id`, raw documents `_id`.
export const videoId = (video) => video?.id || video?._id;

// Where a channel lives: /@handle (YouTube style), falling back to the id.
export const channelPath = (channel) =>
  channel?.handle ? `/@${channel.handle}` : channel?.id ? `/channel/${channel.id}` : "/channels";

export const fullDate = (date) =>
  date ? new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
