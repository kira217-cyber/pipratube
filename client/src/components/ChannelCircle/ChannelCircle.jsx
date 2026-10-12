import React from "react";
import { Link } from "react-router";
import { Radio } from "lucide-react";

import { IMG, mediaUrl } from "../../utils/format";

// Round channel avatar used for Live TV channels and creator channels.
// Pass `to` for a link, or `onClick` to act as a selector (Live TV page).
const ChannelCircle = ({ name, logo, to, onClick, active, live, className = "" }) => {
  const inner = (
    <>
      <span
        className={`relative block aspect-square w-full rounded-full p-[3px] transition ${
          active
            ? "bg-brand-gradient shadow-[0_0_18px_rgba(255,45,111,0.45)]"
            : "bg-white/10 group-hover:bg-white/25"
        }`}
      >
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-black">
          {logo ? (
            <img
              src={mediaUrl(logo, IMG.avatar)}
              alt={name}
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          ) : (
            <Radio className="h-6 w-6 text-brand" />
          )}
        </span>
        {live && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-live px-1.5 text-[10px] font-bold leading-4 text-white">
            LIVE
          </span>
        )}
      </span>
      <span
        className={`mt-2 block w-full truncate text-center text-xs font-medium sm:text-sm ${
          active ? "text-brand" : "text-slate-300 group-hover:text-white"
        }`}
      >
        {name}
      </span>
    </>
  );

  const classes = `group block min-w-0 cursor-pointer ${className}`;

  return to ? (
    <Link to={to} className={classes} title={name}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={classes} title={name}>
      {inner}
    </button>
  );
};

export const ChannelRail = ({ children }) => (
  <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">{children}</div>
);

export const railItemClass = "w-[22%] shrink-0 sm:w-[15%] lg:w-[11%] xl:w-[9%]";

export default ChannelCircle;
