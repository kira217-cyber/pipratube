import Channel from "../models/Channel.js";
import Video, { VIDEO_CATEGORIES } from "../models/Video.js";

// YouTube-style search: a video turns up when ANY word of the query appears
// in its title, tags, description, category or its channel's name/handle.
// Results are ranked — the whole phrase in the title beats one stray word in
// a description — then by how many of the words matched, then by views.

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Letters, digits and combining marks (Bangla vowel signs are marks), so
// "ব্যাচেলর পয়েন্ট" splits into whole words, not broken pieces.
export const searchWords = (text) => {
  const all = [...new Set(String(text || "").toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) || [])];
  const long = all.filter((word) => word.length > 1);
  return (long.length ? long : all).slice(0, 10);
};

const normalize = (text) => String(text || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);

// Builds the Mongo condition for a query, plus what the ranking needs.
export const searchQuery = async (text) => {
  const phrase = normalize(text);
  const words = searchWords(phrase);
  if (!words.length) return null;
  const patterns = words.map((word) => new RegExp(escape(word), "i"));

  const channels = await Channel.find({ status: "active", $or: patterns.flatMap((p) => [{ name: p }, { handle: p }]) })
    .select("_id name handle")
    .limit(300)
    .lean();
  const categories = VIDEO_CATEGORIES.filter((category) => words.some((word) => word.length > 2 && category.toLowerCase().startsWith(word)));

  const or = patterns.flatMap((p) => [{ title: p }, { tags: p }, { description: p }]);
  if (channels.length) or.push({ channel: { $in: channels.map((c) => c._id) } });
  if (categories.length) or.push({ category: { $in: categories } });

  return { phrase, words, or, channelText: new Map(channels.map((c) => [String(c._id), `${c.name} ${c.handle}`.toLowerCase()])) };
};

const scoreOf = (video, { phrase, words, channelText }) => {
  const title = (video.title || "").toLowerCase();
  const tags = (video.tags || []).join(" ").toLowerCase();
  const description = (video.description || "").toLowerCase();
  const category = (video.category || "").toLowerCase();
  const channel = channelText.get(String(video.channel)) || "";

  let score = 0;
  if (phrase.length > 1) {
    if (title.includes(phrase)) score += title.startsWith(phrase) ? 140 : 100;
    if (tags.includes(phrase)) score += 60;
    if (channel.includes(phrase)) score += 50;
    if (description.includes(phrase)) score += 25;
  }
  let matched = 0;
  words.forEach((word) => {
    const hits = [
      [title.includes(word), 14],
      [tags.includes(word), 9],
      [channel.includes(word), 8],
      [category.startsWith(word), 5],
      [description.includes(word), 3],
    ].filter(([hit]) => hit);
    hits.forEach(([, points]) => {
      score += points;
    });
    if (hits.length) matched += 1;
  });
  score += (matched / words.length) * 60;
  return score + Math.log10((video.views || 0) + 1);
};

// Ids of every matching video, best first (at most `max`).
export const rankedVideoIds = async (search, filter, max = 2000) => {
  const query = await searchQuery(search);
  if (!query) return [];
  const rows = await Video.find({ ...filter, $or: query.or })
    .select("_id title tags description category channel views")
    .limit(max)
    .lean();
  return rows
    .map((row) => ({ id: String(row._id), score: scoreOf(row, query) }))
    .sort((a, b) => b.score - a.score)
    .map((row) => row.id);
};
