import { SiteLink } from "../components/ui/ui";
import React from "react";
import { Link } from "react-router";
import { ArrowUp, EllipsisVertical, MessageSquare, ThumbsUp, Eye } from "lucide-react";

import { formatCount, videoId } from "../utils/format";

// Pieces shared by the creator pages (Dashboard, Analytics, Earning).

// The coloured gradient stat tiles at the top of Analytics / Earning.
export const GradientTile = ({ icon: Icon, label, value, growth, from, to, border, children }) => (
  <div
    className="relative overflow-hidden rounded-2xl border p-4"
    style={{ background: `linear-gradient(160deg, ${from}, ${to})`, borderColor: border }}
  >
    <Icon className="h-8 w-8 text-white/90" />
    {label && <p className="mt-3 text-sm text-white/85">{label}</p>}
    <p className="mt-0.5 text-2xl font-bold text-white sm:text-[28px]">{value}</p>
    {growth > 0 && (
      <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-[#4ade80]">
        <ArrowUp className="h-4 w-4" />+{growth.toFixed(1)}%
      </p>
    )}
    {children}
  </div>
);

// One row of the "Top Performing / Top Earning Videos" lists.
export const VideoStatRow = ({ video, rank, right }) => {
  return (
    <div className="flex items-center gap-3 border-b border-line py-3 last:border-0">
      {rank && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-card-2 font-bold">
          {rank}
        </span>
      )}
      <SiteLink to={`/watch/${videoId(video)}`} className="relative w-28 shrink-0 overflow-hidden rounded-lg sm:w-36">
        {video.thumbnail ? <img src={video.thumbnail} alt="" className="aspect-video w-full object-cover" loading="lazy" /> : <span className="block aspect-video bg-card-2" />}
        {video.duration && (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-semibold">{video.duration}</span>
        )}
      </SiteLink>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium text-white">{video.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> {formatCount(video.views)}
          </span>
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3.5 w-3.5" /> {formatCount(video.likes)}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" /> {formatCount(video.commentCount)}
          </span>
        </p>
      </div>
      <div className="shrink-0 text-right">{right}</div>
      <EllipsisVertical className="hidden h-5 w-5 shrink-0 text-muted sm:block" />
    </div>
  );
};

export const RangeSelect = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={(event) => onChange(Number(event.target.value))}
    className="h-11 cursor-pointer rounded-xl border border-line bg-card-2 px-3 text-sm text-white outline-none [color-scheme:dark]"
  >
    {options.map((option) => (
      <option key={option} value={option}>
        Last {option} days
      </option>
    ))}
  </select>
);
