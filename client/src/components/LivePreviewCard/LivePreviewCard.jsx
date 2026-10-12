import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { EllipsisVertical, Maximize } from "lucide-react";

import { Avatar } from "../ui/ui";
import LiveTvOverlays from "../LiveTvPlayer/LiveTvOverlays";
import { api } from "../../api/axios";
import { useViewerStats, formatOnline } from "../../hooks/useViewerStats";
import { IMG, mediaUrl } from "../../utils/format";

// "PipraTube is live" card on Home: a silent preview of what the channel is
// playing right now (scheduled channel), tapping through to Live TV.
const LivePreviewCard = ({ channel, fallbackImage }) => {
  const videoRef = useRef(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const { online } = useViewerStats(channel._id);

  useEffect(() => {
    if (channel.channelType !== "scheduled") return undefined;
    let cancelled = false;
    api
      .get(`/api/site/live-tv/${channel._id}/now-playing`)
      .then(({ data }) => {
        if (!cancelled) setNowPlaying(data?.data?.nowPlaying || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channel._id, channel.channelType]);

  const startAtLiveEdge = () => {
    const player = videoRef.current;
    if (player && nowPlaying?.offsetSeconds) player.currentTime = nowPlaying.offsetSeconds;
  };

  const to = `/live-tv/${channel._id}`;

  return (
    <article>
      <Link to={to} className="relative block overflow-hidden rounded-2xl border border-line bg-black">
        <div className="relative aspect-video">
          {fallbackImage && (
            <img src={fallbackImage} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
          )}
          {nowPlaying?.video?.url && (
            <video
              ref={videoRef}
              src={nowPlaying.video.url}
              muted
              autoPlay
              playsInline
              loop
              preload="metadata"
              onLoadedMetadata={startAtLiveEdge}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/25" />
        </div>

        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-live px-2.5 py-1 text-sm font-bold text-white shadow-lg">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> LIVE
        </span>
        {/* The logo the admin set for this channel (or the PipraTube logo). */}
        <LiveTvOverlays channelId={channel._id} logoOnly />
        <span className="absolute bottom-3 right-3 flex items-center gap-3 rounded-lg bg-black/55 px-2.5 py-1 text-sm font-bold text-live backdrop-blur-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-live" /> LIVE
          </span>
          <Maximize className="h-4 w-4 text-white" />
        </span>
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <Link to={to}>
          <Avatar src={mediaUrl(channel.logo, IMG.avatar)} name={channel.name} size="h-11 w-11" />
        </Link>
        <Link to={to} className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-white">{channel.name}</p>
          <p className="text-[13px] text-muted">Live Channel · {formatOnline(online)} watching</p>
        </Link>
        <EllipsisVertical className="h-5 w-5 shrink-0 text-white/80" />
      </div>
    </article>
  );
};

export default LivePreviewCard;
