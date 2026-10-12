import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, EllipsisVertical, Play } from "lucide-react";

import { Avatar } from "../ui/ui";
import VideoPreview from "../VideoPreview/VideoPreview";
import { channelPath, videoId, videoMeta } from "../../utils/format";
import VideoMenu from "../VideoMenu/VideoMenu";
import HiddenNotice from "../VideoMenu/HiddenNotice";
import { hiddenReason, useVideoPrefs } from "../../utils/videoPrefs";

const Thumb = ({ video, className = "aspect-video", autoplayInView = false }) => (
  <VideoPreview
    id={`card-${videoId(video)}-${className}`}
    src={video.videoUrl}
    poster={video.thumbnail}
    alt={video.title}
    duration={video.duration}
    autoplayInView={autoplayInView}
    className={`w-full rounded-xl border border-line bg-card-2 ${className}`}
  />
);

// YouTube's hover: a soft panel eases in behind the whole card — it fades
// and grows from 97% together, and settles out the same way (mouse only).
export const HoverPanel = () => (
  <span className="pointer-events-none absolute -inset-2 -z-10 scale-[0.97] rounded-2xl bg-white/[0.07] opacity-0 transition-[opacity,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] [@media(hover:hover)]:group-hover/card:scale-100 [@media(hover:hover)]:group-hover/card:opacity-100" />
);

// The ⋮ button: always there on touch screens, on hover with a mouse.
export const cardMenuClass = "-mr-2 -mt-1 transition-opacity duration-300 ease-[cubic-bezier(0.2,0,0,1)] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100 [@media(hover:hover)]:focus:opacity-100";

// The standard card in every row: 16:9 poster, title, channel, meta, ⋮.
export const VideoCard = ({ video, showChannel = true, className = "" }) => {
  const prefs = useVideoPrefs();
  const hidden = hiddenReason(prefs, video);
  if (hidden) return <HiddenNotice video={video} reason={hidden} className={className} />;
  const to = `/watch/${videoId(video)}`;
  return (
    <div className={`group/card relative isolate min-w-0 ${className}`}>
      <HoverPanel />
      <Link to={to} className="group block">
        <Thumb video={video} />
      </Link>
      <div className="mt-2 flex gap-1">
        <Link to={to} className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-white sm:text-[15px]">{video.title}</p>
          {showChannel && video.channel?.name && <p className="mt-0.5 truncate text-xs text-muted sm:text-sm">{video.channel?.name}</p>}
          {videoMeta(video) && <p className="truncate text-xs text-muted sm:text-sm">{videoMeta(video)}</p>}
        </Link>
        <VideoMenu video={video} className={cardMenuClass} />
      </div>
    </div>
  );
};

// A horizontally scrolling row of cards — swipe on mobile, scroll on desktop.
// Swipe on phones; on desktop, arrow buttons (shown only when there's more
// to that side) and click-and-drag. With more than `limit` videos a
// "See more" button opens them all as a grid below.
export const VideoRail = ({ videos, showChannel = true, limit = 10 }) => {
  const rail = useRef(null);
  const drag = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? videos : videos.slice(0, limit);

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, shown.length]);

  const scrollBy = (direction) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };

  if (expanded) {
    return (
      <div>
        <VideoGrid videos={videos} showChannel={showChannel} />
        <div className="mt-5 flex justify-center">
          <button type="button" onClick={() => setExpanded(false)} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-card-2 px-5 py-2 text-sm font-semibold hover:bg-white/10">
            Show less <ChevronUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const arrow = "absolute top-[calc(50%-2.5rem)] z-10 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-xl backdrop-blur transition hover:bg-black sm:flex";

  return (
    <div>
      <div className="relative">
        <div
          ref={rail}
          onScroll={measure}
          // Links and images start a native drag that would swallow ours.
          onDragStart={(event) => event.preventDefault()}
          // Mouse drag to scroll (touch already swipes natively).
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse" || event.button !== 0) return;
            drag.current = { x: event.clientX, left: rail.current.scrollLeft, moved: false };
          }}
          onPointerMove={(event) => {
            const d = drag.current;
            if (!d) return;
            const dx = event.clientX - d.x;
            if (Math.abs(dx) > 5) d.moved = true;
            if (d.moved) rail.current.scrollLeft = d.left - dx;
          }}
          onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
          onPointerLeave={() => (drag.current = null)}
          onClickCapture={(event) => {
            // A drag that ends on a card shouldn't open it.
            if (drag.current?.moved) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 sm:mx-0 sm:scroll-px-0 sm:px-0"
        >
          {shown.map((video) => (
            <VideoCard
              key={videoId(video)}
              video={video}
              showChannel={showChannel}
              className="w-[44%] shrink-0 snap-start sm:w-[31%] lg:w-[23.5%] xl:w-[18.8%]"
            />
          ))}
        </div>
        {!edges.start && (
          <button type="button" aria-label="Scroll left" onClick={() => scrollBy(-1)} className={`${arrow} -left-3`}>
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {!edges.end && (
          <button type="button" aria-label="Scroll right" onClick={() => scrollBy(1)} className={`${arrow} -right-3`}>
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
      {videos.length > limit && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setExpanded(true)} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-card-2 px-5 py-2 text-sm font-semibold hover:bg-white/10">
            See more ({videos.length - limit}) <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export const VideoGrid = ({ videos, showChannel = true }) => (
  <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
    {videos.map((video) => (
      <VideoCard key={videoId(video)} video={video} showChannel={showChannel} />
    ))}
  </div>
);

// The large "featured" video at the top of the Videos page.
export const FeaturedVideo = ({ video }) => (
  <div>
    <Link to={`/watch/${videoId(video)}`} className="group relative block">
      <Thumb video={video} className="aspect-video rounded-2xl" autoplayInView />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/90 bg-black/35 backdrop-blur-sm transition group-hover:scale-110 sm:h-20 sm:w-20">
          <Play className="ml-1 h-7 w-7 fill-white text-white sm:h-9 sm:w-9" />
        </span>
      </span>
    </Link>

    <div className="mt-3 flex gap-3">
      <Link to={channelPath(video.channel)}>
        <Avatar src={video.channel?.avatar} name={video.channel?.name} size="h-11 w-11" />
      </Link>
      <Link to={`/watch/${videoId(video)}`} className="min-w-0 flex-1">
        <p className="line-clamp-2 text-base font-semibold text-white sm:text-lg">{video.title}</p>
        <p className="truncate text-sm text-muted">
          {[video.channel?.name, videoMeta(video)].filter(Boolean).join(" · ")}
        </p>
      </Link>
      <EllipsisVertical className="h-5 w-5 shrink-0 text-muted" />
    </div>
  </div>
);

// Wide row: thumbnail left, details right — channel home "latest upload".
export const VideoRow = ({ video, children }) => (
  <Link to={`/watch/${videoId(video)}`} className="group flex gap-3 sm:gap-4">
    <div className="w-[48%] shrink-0 sm:w-[40%] lg:w-[34%]">
      <Thumb video={video} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="line-clamp-2 text-sm font-semibold text-white sm:text-lg">{video.title}</p>
      {videoMeta(video) && <p className="mt-1 text-xs text-muted sm:text-sm">{videoMeta(video)}</p>}
      {children}
    </div>
  </Link>
);

export default VideoCard;
