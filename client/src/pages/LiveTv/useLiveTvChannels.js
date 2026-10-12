import { useEffect, useMemo, useState } from "react";

import { api } from "../../api/axios";
import { useLiveTvAvailability } from "../../hooks/useLiveTvAvailability";

// The whole channel list in one go (sections need every channel to group
// them), with streams that failed their health check already removed.
const LIMIT = 500;

// Kept for the whole visit, so coming back to Live TV is instant.
let cached = null;

export const useLiveTvChannels = () => {
  const [state, setState] = useState(cached || { channels: [], categories: [], loading: true });

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/site/live-tv", { params: { limit: LIMIT } })
      .then(({ data }) => {
        cached = {
          channels: data?.data?.channels || [],
          categories: data?.data?.categories || [],
          loading: false,
        };
        if (!cancelled) setState(cached);
      })
      .catch(() => {
        if (!cancelled) setState((previous) => ({ ...previous, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { isAvailable, markUnavailable } = useLiveTvAvailability(state.channels);
  const channels = useMemo(() => state.channels.filter(isAvailable), [state.channels, isAvailable]);

  return { channels, categories: state.categories, loading: state.loading, markUnavailable };
};

export default useLiveTvChannels;
