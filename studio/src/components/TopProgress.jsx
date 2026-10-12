import React, { useEffect, useState, useSyncExternalStore } from "react";

import { snapshot, subscribe } from "../utils/requestTracker";

// A thin bar across the top while any request is running (saving, deleting,
// loading a page…), so every click shows it's being worked on — like
// YouTube's red loading line. Axios clients report in through
// `trackRequests` (utils/requestTracker.js).

const TopProgress = () => {
  const busy = useSyncExternalStore(subscribe, snapshot) > 0;
  const [shown, setShown] = useState(false);

  // Only for requests that take a moment — no flicker on fast ones — and
  // let the bar finish its sweep before hiding.
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(busy), busy ? 150 : 250);
    return () => window.clearTimeout(timer);
  }, [busy]);

  if (!shown) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden" role="progressbar" aria-label="Loading">
      <div className="top-progress h-full w-1/3 rounded-full bg-gradient-to-r from-[#ff9a1f] via-[#ff2d6f] to-[#c026d3] shadow-[0_0_10px_#ff2d6f]" />
    </div>
  );
};

export default TopProgress;
