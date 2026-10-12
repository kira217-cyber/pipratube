import { api } from "../api/axios";
import { studioApi, TOKEN_KEY } from "../api/studioApi";

// A stable anonymous id per browser, so a signed-out viewer's views are
// counted once per video rather than once per page load.
export const visitorId = () => {
  const key = "pipra_v2_visitor";
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
};

// Record a view once playback has actually started.
export const countView = (videoId) => {
  const client = localStorage.getItem(TOKEN_KEY) ? studioApi : api;
  return client.post(`/api/videos/${videoId}/view`, { visitorId: visitorId() }).catch(() => {});
};

export const countShare = (videoId) => api.post(`/api/videos/${videoId}/share`).catch(() => {});
