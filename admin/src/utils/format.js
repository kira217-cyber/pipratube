// 1234 → "1.2K"
export const formatCount = (value) => {
  const n = Number(value) || 0;
  const trim = (x) => (x >= 100 ? Math.round(x) : x.toFixed(1).replace(/\.0$/, ""));
  if (n >= 1e9) return `${trim(n / 1e9)}B`;
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}K`;
  return String(n);
};

export const timeAgo = (date) => {
  if (!date) return "";
  const seconds = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  for (const [unit, size] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]]) {
    const amount = Math.floor(seconds / size);
    if (amount >= 1) return `${amount} ${unit}${amount > 1 ? "s" : ""} ago`;
  }
  return "just now";
};

export const fullDate = (date) =>
  date ? new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const VIDEO_CATEGORIES = ["Movie", "Natok", "Drama", "Music", "Comedy", "Action", "Romance", "Horror", "Thriller", "Sports", "News", "Kids", "Education", "Documentary", "Gaming", "Lifestyle", "Religion", "Other"];
