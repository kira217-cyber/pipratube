import React from "react";
import { Link } from "react-router";
import {
  ChevronRight,
  Clapperboard,
  Crown,
  Drama,
  Film,
  Newspaper,
  Radio,
  Sparkles,
  Tv,
  Baby,
  Volleyball,
  Moon,
  Lightbulb,
} from "lucide-react";

import { IMG, mediaUrl } from "../../utils/format";

// Building blocks of the Live TV design.

// The six quick filters under the player. `key` is a server category key
// (models/liveTvCategories.js); "" means every channel.
const QUICK_FILTERS = [
  { key: "", label: "All TV", icon: Tv, color: "#ff2d6f" },
  { key: "movie", label: "Movies", icon: Clapperboard, color: "#a855f7" },
  { key: "sports", label: "Sports", icon: Volleyball, color: "#22c55e" },
  { key: "news", label: "News", icon: Newspaper, color: "#f59e0b" },
  { key: "entertainment", label: "Drama", icon: Drama, color: "#ec4899" },
  { key: "kids", label: "Kids", icon: Baby, color: "#3b82f6" },
];

// Icon and "See All" accent per section.
const SECTION_STYLE = {
  __pinned: { icon: Crown, iconClass: "fill-amber-400 text-amber-300", from: "#4c1a7a", to: "#7a1d5e", accent: "#ff3d8b" },
  bangladeshi: { icon: null, flag: true, from: "#14306f", to: "#1d2f66", accent: "#a855f7" },
  sports: { icon: Volleyball, iconClass: "text-white", from: "#341a6e", to: "#2a1650", accent: "#c084fc" },
  news: { icon: Newspaper, iconClass: "text-cyan-300", from: "#0d3f4f", to: "#123248", accent: "#ff3d8b" },
  movie: { icon: Film, iconClass: "text-pink-300", from: "#4a1640", to: "#2e1238", accent: "#ff3d8b" },
  entertainment: { icon: Sparkles, iconClass: "text-amber-300", from: "#4a2a10", to: "#3a1a26", accent: "#f59e0b" },
  infotainment: { icon: Lightbulb, iconClass: "text-yellow-300", from: "#2e3a12", to: "#1c2a1a", accent: "#a3e635" },
  kids: { icon: Baby, iconClass: "text-sky-300", from: "#123a6a", to: "#1a2552", accent: "#38bdf8" },
  islamic: { icon: Moon, iconClass: "fill-emerald-300 text-emerald-300", from: "#0f3b2c", to: "#13302a", accent: "#34d399" },
};
const DEFAULT_STYLE = { icon: Radio, iconClass: "text-white", from: "#1f2a44", to: "#18203a", accent: "#ff3d8b" };

const BangladeshFlag = () => (
  <span className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#006a4e]">
    <span className="h-3.5 w-3.5 -translate-x-0.5 rounded-full bg-[#f42a41]" />
  </span>
);

export const QuickFilters = ({ value, onChange }) => (
  <div className="grid grid-cols-6 gap-1.5 sm:gap-3">
    {QUICK_FILTERS.map(({ key, label, icon: Icon, color }) => {
      const active = value === key;
      return (
        <button
          key={label}
          type="button"
          onClick={() => onChange(key)}
          className="flex aspect-square min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] transition sm:aspect-auto sm:py-3"
          style={{
            borderColor: active ? color : `${color}55`,
            background: active ? `${color}22` : "#121826",
            boxShadow: active ? `0 0 14px ${color}66, inset 0 0 10px ${color}22` : "none",
          }}
        >
          <Icon className="h-6 w-6 sm:h-7 sm:w-7" style={{ color }} strokeWidth={1.8} />
          <span className="w-full truncate text-center text-[10px] font-medium text-white min-[380px]:text-[11px] sm:text-sm">{label}</span>
        </button>
      );
    })}
  </div>
);

// A channel logo on a white tile — the 4-across grid inside each section.
export const LogoTile = ({ channel, active, onClick, to }) => {
  const body = (
    <span
      className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl p-2 transition ${
        channel.channelType === "scheduled" ? "bg-[#0b0f15]" : "bg-white"
      } ${active ? "ring-[3px] ring-[#ff3d8b] shadow-[0_0_16px_rgba(255,61,139,0.7)]" : "ring-1 ring-white/10 hover:ring-white/40"}`}
    >
      {channel.logo ? (
        <img
          src={mediaUrl(channel.logo, IMG.logo)}
          alt={channel.name}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <span className="line-clamp-2 text-center text-xs font-bold text-black">{channel.name}</span>
      )}
    </span>
  );

  return to ? (
    <Link to={to} title={channel.name} className="block cursor-pointer">
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} title={channel.name} className="block w-full cursor-pointer">
      {body}
    </button>
  );
};

export const SectionPanel = ({ sectionKey, title, seeAllTo, onSeeAll, children }) => {
  const style = SECTION_STYLE[sectionKey] || DEFAULT_STYLE;
  const Icon = style.icon;
  const seeAllClass =
    "flex shrink-0 items-center gap-0.5 rounded-full border-[1.5px] bg-black/40 px-2.5 py-1 text-[13px] font-semibold text-white sm:px-3 sm:text-sm";
  const seeAllStyle = { borderColor: style.accent, boxShadow: `0 0 10px ${style.accent}88` };

  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2">
        {style.flag ? <BangladeshFlag /> : Icon && <Icon className={`h-6 w-6 shrink-0 ${style.iconClass}`} />}
        <h2 className="min-w-0 flex-1 truncate text-[14px] font-bold uppercase text-white min-[380px]:text-[15px] sm:text-base sm:tracking-wide">{title}</h2>
        {seeAllTo ? (
          <Link to={seeAllTo} className={seeAllClass} style={seeAllStyle}>
            See All <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          onSeeAll && (
            <button type="button" onClick={onSeeAll} className={`${seeAllClass} cursor-pointer`} style={seeAllStyle}>
              See All <ChevronRight className="h-4 w-4" />
            </button>
          )
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3 lg:grid-cols-8">{children}</div>
    </section>
  );
};
