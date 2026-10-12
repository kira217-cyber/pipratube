// Video categories — `value` must match the server's VIDEO_CATEGORIES
// (Pipra-TV-NEW-VERSION/server/models/Video.js).
export const VIDEO_CATEGORIES = [
  { label: "All", value: "" },
  { label: "Movies", value: "Movie" },
  { label: "Natok", value: "Natok" },
  { label: "Drama", value: "Drama" },
  { label: "Music", value: "Music" },
  { label: "Comedy", value: "Comedy" },
  { label: "Action", value: "Action" },
  { label: "Romance", value: "Romance" },
  { label: "Horror", value: "Horror" },
  { label: "Thriller", value: "Thriller" },
  { label: "Sports", value: "Sports" },
  { label: "News", value: "News" },
  { label: "Kids", value: "Kids" },
  { label: "Education", value: "Education" },
  { label: "Documentary", value: "Documentary" },
  { label: "Gaming", value: "Gaming" },
  { label: "Lifestyle", value: "Lifestyle" },
  { label: "Religion", value: "Religion" },
  { label: "Other", value: "Other" },
];

export const categoryLabel = (value) =>
  VIDEO_CATEGORIES.find((item) => item.value === value)?.label || value;
