import React from "react";
import { Eye, Heart } from "lucide-react";

import HlsPlayer from "../HlsPlayer/HlsPlayer";
import ScheduledLiveTvPlayer from "../ScheduledLiveTvPlayer/ScheduledLiveTvPlayer";
import LiveTvOverlays from "./LiveTvOverlays";
import { Avatar, Logo } from "../ui/ui";
import { formatOnline, formatViews, useViewerStats } from "../../hooks/useViewerStats";
import { IMG, mediaUrl } from "../../utils/format";

// Channel identity + live counters under the player.
const NowPlayingBar = ({ channel }) => {
  const { online, views } = useViewerStats(channel._id);
  return (
    <div className="mt-3 flex items-center gap-3">
      <span className="rounded-full bg-gradient-to-br from-[#ff2d8b] via-[#a855f7] to-[#3b82f6] p-[2px]">
        <Avatar src={mediaUrl(channel.logo, IMG.avatar)} name={channel.name} size="h-12 w-12 sm:h-14 sm:w-14" ring={false} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold text-white sm:text-xl">{channel.name}</p>
        <p className="flex items-center gap-1.5 truncate text-[13px] sm:text-sm">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#22c55e]" />
          <span className="text-[#4ade80]">Now Playing</span>
          <span className="text-muted">•</span>
          <span className="truncate text-slate-200">Live Channel</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 border-l border-white/15 pl-3 sm:gap-5 sm:pl-5">
        <span className="flex items-center gap-1.5">
          <Eye className="h-5 w-5 text-white sm:h-6 sm:w-6" />
          <span className="leading-tight">
            <span className="block text-sm font-bold text-white sm:text-base">{formatOnline(online)}</span>
            <span className="block text-[10px] text-muted sm:text-xs">Watching</span>
          </span>
        </span>
        <span className="hidden items-center gap-1.5 min-[400px]:flex">
          <Heart className="h-5 w-5 text-[#ff3d8b] sm:h-6 sm:w-6" />
          <span className="leading-tight">
            <span className="block text-sm font-bold text-white sm:text-base">{formatViews(views)}</span>
            <span className="block text-[10px] text-muted sm:text-xs">Views Today</span>
          </span>
        </span>
      </div>
    </div>
  );
};

// Plays any Live TV channel: Pipra-TV's own scheduled channel through its
// timetable player, every external channel as an HLS stream — inside the
// design's neon frame, followed by the channel / live-counter bar.
const LiveTvPlayer = ({ channel, initialNowPlaying, onUnavailable }) => {
  const poster = channel.logo ? mediaUrl(channel.logo, IMG.logo) : undefined;

  return (
    <div>
      <div className="rounded-2xl bg-gradient-to-br from-[#ff2d8b] via-[#7c3aed] to-[#22d3ee] p-[2px] shadow-[0_0_22px_rgba(124,58,237,0.45)]">
        <div className="relative overflow-hidden rounded-[14px] bg-black">
          {channel.channelType === "scheduled" ? (
            <ScheduledLiveTvPlayer
              key={channel._id}
              channelId={channel._id}
              initialNowPlaying={initialNowPlaying}
              poster={poster}
              title={channel.name}
              adsTarget={{ liveTv: channel._id }}
            />
          ) : (
            <HlsPlayer
              key={channel._id}
              src={channel.streamUrl}
              poster={poster}
              title={channel.name}
              adsTarget={{ liveTv: channel._id }}
              onUnavailable={onUnavailable}
            />
          )}
          <LiveTvOverlays key={`overlays-${channel._id}`} channelId={channel._id} />
        </div>
      </div>
      <NowPlayingBar channel={channel} />
    </div>
  );
};

export default LiveTvPlayer;
