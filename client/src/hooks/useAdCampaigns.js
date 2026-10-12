import { useEffect, useState } from "react";

import { api } from "../api/axios";

// In-player ad campaigns (admin → Ads → video ads) for one video or Live TV
// channel.
export const useAdCampaigns = ({ video, liveTv } = {}) => {
  const [state, setState] = useState({ key: null, campaigns: [] });
  const key = video ? `v:${video}` : liveTv ? `l:${liveTv}` : null;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    api
      .get("/api/site/ad-campaigns", { params: video ? { video } : { liveTv } })
      .then(({ data }) => !cancelled && setState({ key, campaigns: data?.data?.campaigns || [] }))
      .catch(() => !cancelled && setState({ key, campaigns: [] }));
    return () => {
      cancelled = true;
    };
  }, [key, video, liveTv]);

  return { campaigns: state.key === key ? state.campaigns : [] };
};

export default useAdCampaigns;
