import { io } from "socket.io-client";

import { api } from "../api/axios";
import { TOKEN_KEY } from "../api/studioApi";
import { visitorId } from "../utils/visitor";

// One shared socket per tab for admin → Live analytics: which page each
// visitor is on, what they're watching, and notable actions.
let shared = null;

export const getPresenceSocket = () => {
  if (shared) return shared;
  shared = io(`${api.defaults.baseURL}/analytics-feed`, {
    auth: (cb) =>
      cb({
        visitorId: visitorId(),
        token: localStorage.getItem(TOKEN_KEY) || undefined,
        device: window.matchMedia("(max-width: 1023px)").matches ? "mobile" : "desktop",
      }),
    transports: ["websocket", "polling"],
  });
  return shared;
};

// Fire-and-forget activity tag ("Played video", "Liked", …).
export const trackAction = (action, meta) => {
  getPresenceSocket().emit("user:action", { action, meta });
};

export default getPresenceSocket;
