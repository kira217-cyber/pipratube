import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

import { useFetch } from "../../hooks/useFetch";

// The corners of the Live TV player, managed in Admin → Live TV overlays:
//
//   • logo  — shown all the time (the channel's own logo instead of the
//             site logo); one made for this channel beats one for all.
//   • image / video ads — appear after `firstDelaySeconds` of watching, stay
//             `durationSeconds`, then come back every `intervalSeconds`.
//             While one is up it takes its corner's place.
//
// With no logo set for a channel, its corner stays empty.
// `logoOnly` (Home's Live TV card) shows just the logo, never the ads.

const CORNER = {
  "top-right": "right-3 top-2",
  "top-left": "left-3 top-11 sm:top-12",
  "bottom-right": "bottom-16 right-3",
  "bottom-left": "bottom-16 left-3",
};
const LOGO_SIZE = { small: "h-7 sm:h-9", medium: "h-9 sm:h-12", large: "h-12 sm:h-16" };
const AD_SIZE = { small: "w-24 sm:w-36", medium: "w-32 sm:w-52", large: "w-44 sm:w-72" };

const isVisible = (ad, seconds) => {
  const t = seconds - (ad.firstDelaySeconds || 0);
  if (t < 0) return false;
  return t % Math.max(ad.intervalSeconds || 300, (ad.durationSeconds || 10) + 1) < (ad.durationSeconds || 10);
};

const Linked = ({ url, className, children }) =>
  url ? (
    <a href={url} target={url.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className={`pointer-events-auto ${className}`}>
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );

const LiveTvOverlays = ({ channelId, logoOnly = false }) => {
  const { data } = useFetch(channelId ? "/api/site/live-tv-overlays" : null, { channel: channelId });
  const overlays = data?.overlays || [];
  const [seconds, setSeconds] = useState(0);
  const [closed, setClosed] = useState({}); // ad id → the seconds it was closed at

  const ads = logoOnly ? [] : overlays.filter((o) => o.kind !== "logo");
  useEffect(() => {
    if (!ads.length) return undefined;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [ads.length]);

  const logos = overlays.filter((o) => o.kind === "logo");
  const logo = logos.find((o) => o.channels.includes(String(channelId))) || logos.find((o) => !o.channels.length) || null;

  // One ad per corner at a time; an ad closed with × stays away until its next turn.
  const showing = {};
  ads.forEach((ad) => {
    const closedAt = closed[ad.id];
    const sameTurn = closedAt !== undefined && seconds - closedAt < (ad.durationSeconds || 10);
    if (!showing[ad.position] && !sameTurn && isVisible(ad, seconds)) showing[ad.position] = ad;
  });

  const logoCorner = logo?.position || "top-right";

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Only a logo the admin set for this channel (or for all channels) —
          nothing at all otherwise. On Home's card the whole card is already
          a link, so no link inside a link. */}
      {logo && !showing[logoCorner] && (
        <Linked url={logoOnly ? "" : logo.url} className={`absolute ${CORNER[logoCorner]}`}>
          <img src={logo.media} alt={logo.title} className={`${LOGO_SIZE[logo.size] || LOGO_SIZE.medium} w-auto max-w-[40vw] object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]`} />
        </Linked>
      )}

      {Object.entries(showing).map(([corner, ad]) => (
        <div key={ad.id} className={`absolute ${CORNER[corner]} ${AD_SIZE[ad.size] || AD_SIZE.medium}`}>
          <Linked url={ad.url} className="block overflow-hidden rounded-lg shadow-2xl shadow-black/60 ring-1 ring-white/20">
            {ad.kind === "video" ? (
              <video src={ad.media} autoPlay muted playsInline className="block w-full bg-black" />
            ) : (
              <img src={ad.media} alt={ad.title} className="block w-full object-contain" />
            )}
          </Linked>
          <button
            type="button"
            aria-label="Close ad"
            onClick={() => setClosed((c) => ({ ...c, [ad.id]: seconds }))}
            className="pointer-events-auto absolute -right-2 -top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/80 text-white ring-1 ring-white/30 hover:bg-black"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white/90">Ad</span>
        </div>
      ))}
    </div>
  );
};

export default LiveTvOverlays;
