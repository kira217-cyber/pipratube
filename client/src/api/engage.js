import { studioApi } from "./studioApi";
import { trackAction } from "../hooks/presenceSocket";

// Signed-in actions: reactions, subscriptions, comments, playlists,
// notifications. Each returns the `data` payload from the server.
const data = (promise) => promise.then((response) => response.data.data);

// Same call, plus a line in admin → Live analytics' activity feed.
const tracked = (label, promise) => data(promise).then((result) => {
  trackAction(label);
  return result;
});

export const reactToVideo = (videoId, value) =>
  tracked(value === "like" ? "Liked a video" : value === "dislike" ? "Disliked a video" : "Removed a rating", studioApi.post(`/api/videos/${videoId}/reaction`, { value }));

export const subscribe = (channelId) => tracked("Subscribed to a channel", studioApi.post(`/api/channels/${channelId}/subscribe`, {}));
export const unsubscribe = (channelId) => data(studioApi.delete(`/api/channels/${channelId}/subscribe`));
export const setBell = (channelId, notify) => data(studioApi.patch(`/api/channels/${channelId}/subscribe`, { notify }));

export const listComments = (client, videoId, { sort = "top", page = 1 } = {}) =>
  data(client.get(`/api/videos/${videoId}/comments`, { params: { sort, page } }));
export const listReplies = (client, commentId) => data(client.get(`/api/comments/${commentId}/replies`));
export const addComment = (videoId, text, parent) =>
  tracked(parent ? "Replied to a comment" : "Commented", studioApi.post(`/api/videos/${videoId}/comments`, { text, parent }));
export const editComment = (id, text) => data(studioApi.patch(`/api/comments/${id}`, { text }));
export const deleteComment = (id) => data(studioApi.delete(`/api/comments/${id}`));
export const likeComment = (id) => data(studioApi.post(`/api/comments/${id}/like`, {}));
export const pinComment = (id) => data(studioApi.post(`/api/comments/${id}/pin`, {}));
export const heartComment = (id) => data(studioApi.post(`/api/comments/${id}/heart`, {}));

export const myPlaylists = (videoId) => data(studioApi.get("/api/me/playlists", { params: { video: videoId } }));
export const togglePlaylistVideo = (playlistId, videoId, add) =>
  tracked(add ? "Saved a video" : "Unsaved a video", studioApi.post(`/api/playlists/${playlistId}/videos`, { video: videoId, add }));
export const createPlaylist = (body) => data(studioApi.post("/api/playlists", body));

export const notifications = (page = 1) => data(studioApi.get("/api/notifications", { params: { page } }));
export const unreadCount = () => data(studioApi.get("/api/notifications/unread-count"));
export const readAll = () => data(studioApi.post("/api/notifications/read-all", {}));
