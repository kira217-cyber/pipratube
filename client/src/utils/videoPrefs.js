import { useSyncExternalStore } from "react";

// What a viewer told us from a video's ⋮ menu, kept in this browser:
//   • "Not interested"          → that video is hidden from lists
//   • "Don't recommend channel" → every video from that channel is hidden
//   • "Add to queue"            → videos to play next on the watch page
// Each list notifies subscribed cards, so they update straight away.

const KEY = "pipra_video_prefs";
const EMPTY = { hiddenVideos: [], hiddenChannels: [], queue: [] };

const read = () => {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...EMPTY };
  }
};

let state = read();
const listeners = new Set();

const write = (next) => {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked — it still applies until the page is closed.
  }
  listeners.forEach((notify) => notify());
};

const subscribe = (notify) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

export const useVideoPrefs = () => useSyncExternalStore(subscribe, () => state, () => EMPTY);

const toggleIn = (list, value, on) => (on ? [...list.filter((x) => x !== value), value].slice(-500) : list.filter((x) => x !== value));

export const hideVideo = (id, on = true) => write({ ...state, hiddenVideos: toggleIn(state.hiddenVideos, id, on) });
export const hideChannel = (id, on = true) => write({ ...state, hiddenChannels: toggleIn(state.hiddenChannels, id, on) });

// The queue keeps small copies of the videos so the watch page can show
// and play them without fetching each one.
export const addToQueue = (video) => {
  const item = { id: video.id, title: video.title, thumbnail: video.thumbnail, duration: video.duration, channel: video.channel ? { id: video.channel.id, name: video.channel.name } : null };
  write({ ...state, queue: [...state.queue.filter((v) => v.id !== video.id), item].slice(-50) });
};
export const removeFromQueue = (id) => write({ ...state, queue: state.queue.filter((v) => v.id !== id) });
export const clearQueue = () => write({ ...state, queue: [] });

// Why a card is hidden: "video", "channel", or null.
export const hiddenReason = (prefs, video) => {
  if (!video) return null;
  if (prefs.hiddenVideos.includes(video.id)) return "video";
  if (video.channel?.id && prefs.hiddenChannels.includes(video.channel.id)) return "channel";
  return null;
};
