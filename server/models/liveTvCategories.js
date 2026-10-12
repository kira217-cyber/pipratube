// The sections the Live TV page is grouped into. Defined once here and
// served to both the admin panel (as the category dropdown) and the client
// (as the section headings), so a label is only ever edited in one place.
//
// `key` is what's stored on a channel and must never change once channels
// are using it — rename the `label` instead. Order matters: it's the order
// the sections appear in on the client's Live TV page.
export const LIVE_TV_CATEGORIES = [
  { key: "sports", label: "Sports Channels" },
  { key: "bangladeshi", label: "বাংলাদেশি চ্যানেল" },
  { key: "news", label: "News Channels" },
  { key: "movie", label: "Movie Channels" },
  { key: "entertainment", label: "Entertainment Channels" },
  { key: "infotainment", label: "Infotainment" },
  { key: "kids", label: "Kids" },
  { key: "islamic", label: "Islamic Channel" },
];

export const LIVE_TV_CATEGORY_KEYS = LIVE_TV_CATEGORIES.map((entry) => entry.key);

// A channel can sit in several categories at once, so the admin panel
// sends them as a JSON array inside multipart form data. Returns a
// de-duplicated list of valid keys, or null if the payload isn't usable.
export const parseLiveTvCategories = (raw) => {
  if (typeof raw === "undefined") return null;

  let list = raw;

  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(list)) return null;
  if (list.some((key) => !LIVE_TV_CATEGORY_KEYS.includes(key))) return null;

  return [...new Set(list)];
};
