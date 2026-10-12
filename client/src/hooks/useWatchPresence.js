import { useEffect } from "react";

import { getPresenceSocket } from "./presenceSocket";

// Reports "currently watching video/liveTv X" to the live Site Analytics
// dashboard in admin — purely for presence tracking, nothing is persisted.
// Pass null/undefined id to skip (e.g. before the video id is known yet).
export const useWatchPresence = (type, id, title) => {
  useEffect(() => {
    if (!id) return undefined;

    const socket = getPresenceSocket();
    socket.emit("watch:start", { type, id, title });

    // The server already swaps rooms cleanly when a new watch:start
    // arrives for the same socket, so a stop-then-start on rapid id
    // changes (e.g. Shorts feed scrolling) is harmless — just an extra
    // broadcast tick, never a stuck/duplicate "watching" entry.
    return () => {
      socket.emit("watch:stop");
    };
  }, [type, id, title]);
};

export default useWatchPresence;
