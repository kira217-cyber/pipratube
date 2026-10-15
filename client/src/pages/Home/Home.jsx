import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight, CloudUpload, EllipsisVertical } from "lucide-react";

import FeedCard from "../../components/FeedCard/FeedCard";
import VideoPreview from "../../components/VideoPreview/VideoPreview";
import LivePreviewCard from "../../components/LivePreviewCard/LivePreviewCard";
import ChannelCircle, { ChannelRail, railItemClass } from "../../components/ChannelCircle/ChannelCircle";
import { EmptyState, LogoMark, SectionHeader, Spinner } from "../../components/ui/ui";
import { api } from "../../api/axios";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import { useFetch } from "../../hooks/useFetch";
import { VideoRail } from "../../components/VideoCard/VideoCard";
import { IMG, channelPath, mediaUrl, videoId, viewsText } from "../../utils/format";
import { useRailGestures } from "../../hooks/useRailGestures";
import StudioLink from "../../components/StudioLink/StudioLink";

const PAGE_SIZE = 12;
// Hovering a Short plays this many seconds on a loop.
const SHORT_PREVIEW_SECONDS = 4;

const ShortsMark = () => (
  <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
    <path
      fill="#ff1f4b"
      d="M15.5 3.2 7.9 7.4a3.4 3.4 0 0 0 .2 6l.7.3-1.1.6a3.4 3.4 0 1 0 3.3 6l7.6-4.2a3.4 3.4 0 0 0-.2-6l-.7-.3 1.1-.6a3.4 3.4 0 1 0-3.3-6Z"
    />
    <path fill="#fff" d="m10.3 9.3 4.4 2.7-4.4 2.7Z" />
  </svg>
);

// Sponsored card — the admin's home ad, in the feed style.
const SponsoredCard = ({ ad }) => {
  const host = (() => {
    try {
      return new URL(ad.url).hostname.replace(/^www\./, "");
    } catch {
      return "PipraTube";
    }
  })();
  // Links into the site (e.g. "/live-tv/…") stay in this tab.
  const internal = ad.url?.startsWith("/");
  const Wrapper = internal ? Link : "a";
  const open = internal ? { to: ad.url } : ad.url ? { href: ad.url, target: "_blank", rel: "noreferrer" } : {};

  return (
    <article>
      <Wrapper {...open} className="relative block overflow-hidden rounded-2xl border border-line bg-card-2">
        <img src={mediaUrl(ad.image, IMG.hero)} alt="Sponsored" className="aspect-video w-full object-cover" loading="eager" />
        {ad.url && (
          <span className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white">
            <ArrowUpRight className="h-6 w-6" />
          </span>
        )}
      </Wrapper>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black p-1">
          <LogoMark className="h-full" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-white">{ad.title || "Special offer — tap to learn more"}</p>
          <p className="text-[13px] text-muted">
            <span className="font-semibold text-slate-200">Sponsored</span> · {host}
          </p>
        </div>
        <EllipsisVertical className="h-5 w-5 shrink-0 text-white/80" />
      </div>
    </article>
  );
};

// A sideways row of Shorts: swipe on phones; on desktop, arrow buttons
// (shown only when there's more that way) and click-and-drag.
const ShortsShelf = ({ videos }) => {
  const rail = useRef(null);
  const drag = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  useRailGestures(rail);

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    const next = { start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 };
    // Only re-render when an arrow actually appears or goes — not on every scroll frame.
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, videos.length]);

  const scrollBy = (direction) => rail.current?.scrollBy({ left: direction * rail.current.clientWidth * 0.85, behavior: "smooth" });
  const arrow =
    "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-xl backdrop-blur transition hover:bg-black sm:flex";

  return (
    // min-w-0: as a grid item it would otherwise grow to fit every card and
    // leave nothing to scroll.
    <section className="offscreen-lazy -mx-4 min-w-0 px-4 sm:col-span-2 sm:-mx-3 sm:px-3 lg:col-span-3">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <ShortsMark /> Shorts
        </h2>
        <Link to="/shorts" className="text-sm font-medium text-muted hover:text-white">
          See all
        </Link>
      </div>
      <div className="relative">
        <div
          ref={rail}
          onScroll={measure}
          onDragStart={(event) => event.preventDefault()}
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
          // scroll-px keeps the first card off the screen edge on phones.
          className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:scroll-px-0 sm:px-0"
        >
          {videos.map((video) => (
            <Link
              key={videoId(video)}
              to={`/shorts?v=${videoId(video)}`}
              className="group relative w-[42%] shrink-0 snap-start overflow-hidden rounded-2xl bg-card-2 min-[480px]:w-[31%] sm:w-[23%] lg:w-[16%]"
            >
              {/* Hover plays the first few seconds, silently, like YouTube. */}
              <VideoPreview id={`home-short-${videoId(video)}`} src={video.videoUrl} posterWidth={360} poster={video.thumbnail} alt={video.title} clipSeconds={SHORT_PREVIEW_SECONDS} minimal className="aspect-[9/16]" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2.5 pt-10">
                <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-white">{video.title}</p>
                <p className="mt-0.5 text-xs text-white/80">{viewsText(video.views)}</p>
              </div>
            </Link>
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
    </section>
  );
};

// How many cards sit in one row of the feed grid (1 / 2 / 3 columns).
const COLUMN_QUERIES = ["(min-width: 1024px)", "(min-width: 640px)"];
const readColumns = () => {
  if (typeof window === "undefined" || !window.matchMedia) return 1;
  if (window.matchMedia(COLUMN_QUERIES[0]).matches) return 3;
  return window.matchMedia(COLUMN_QUERIES[1]).matches ? 2 : 1;
};
const subscribeColumns = (notify) => {
  const lists = COLUMN_QUERIES.map((query) => window.matchMedia(query));
  lists.forEach((list) => list.addEventListener("change", notify));
  return () => lists.forEach((list) => list.removeEventListener("change", notify));
};
const useColumns = () => useSyncExternalStore(subscribeColumns, readColumns, () => 1);

const SHORTS_PER_ROW = 10;

// The Shorts for row `index`: each row gets the next slice of the list;
// once they run out, rows start over at a different point so no two rows
// open with the same clip.
const shortsForRow = (shorts, index) => {
  if (shorts.length <= SHORTS_PER_ROW) {
    const start = (index * 3) % shorts.length;
    return [...shorts.slice(start), ...shorts.slice(0, start)];
  }
  const rows = Math.ceil(shorts.length / SHORTS_PER_ROW);
  const start = (index % rows) * SHORTS_PER_ROW;
  const row = shorts.slice(start, start + SHORTS_PER_ROW);
  return row.length >= 4 ? row : [...row, ...shorts.slice(0, SHORTS_PER_ROW - row.length)];
};

const Home = () => {
  const { settings } = useSiteSettings();
  const curated = settings?.home || {};
  const shuffleVideos = curated.shuffleVideos !== false;
  const shuffleShorts = curated.shuffleShorts !== false;
  const shortsEvery = curated.shortsEvery || 4;
  const columns = useColumns();

  // One random order per visit; it stays put while the feed pages in.
  const [seed] = useState(() => Math.random().toString(36).slice(2, 10));
  const feedParams = useMemo(() => (shuffleVideos ? { sort: "shuffle", seed } : { sort: "latest" }), [shuffleVideos, seed]);

  const { data: shortsData } = useFetch("/api/videos", { type: "shorts", sort: shuffleShorts ? "shuffle" : "latest", seed, limit: 60 });
  const { data: liveData } = useFetch("/api/site/live-tv");

  const [pages, setPages] = useState({ videos: [], page: 0, totalPages: 1, loading: true });
  const sentinel = useRef(null);

  const fetchPage = useCallback(
    (page) => api.get("/api/videos", { params: { ...feedParams, limit: PAGE_SIZE, page } }).then(({ data }) => data?.data),
    [feedParams],
  );

  const appendPage = useCallback((page, data) => {
    setPages((previous) => ({
      videos: page === 1 ? data?.videos || [] : [...previous.videos, ...(data?.videos || [])],
      page,
      totalPages: data?.totalPages || 1,
      loading: false,
    }));
  }, []);

  const loadPage = useCallback(
    (page) => {
      setPages((previous) => ({ ...previous, loading: true }));
      fetchPage(page)
        .then((data) => appendPage(page, data))
        .catch(() => setPages((previous) => ({ ...previous, loading: false })));
    },
    [appendPage, fetchPage],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage(1)
      .then((data) => !cancelled && appendPage(1, data))
      .catch(() => !cancelled && setPages((previous) => ({ ...previous, loading: false })));
    return () => {
      cancelled = true;
    };
  }, [appendPage, fetchPage]);

  // Endless feed: next page as the bottom comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !pages.loading && pages.page > 0 && pages.page < pages.totalPages) {
          loadPage(pages.page + 1);
        }
      },
      { rootMargin: "800px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pages, loadPage]);

  const liveChannels = useMemo(() => liveData?.channels || [], [liveData]);
  const ownChannel = liveChannels.find((channel) => channel.channelType === "scheduled");
  const channels = settings?.channels || [];
  const pinnedShorts = curated.pinnedShorts || [];
  const shorts = [...pinnedShorts, ...(shortsData?.videos || []).filter((v) => !pinnedShorts.some((p) => p.id === v.id))];
  const ad = settings?.ads?.home;
  const feedAds = settings?.ads?.feed || [];
  const sections = curated.sections || [];
  // Admin-pinned videos lead the feed; the rest follow without repeats.
  const pinned = curated.pinnedVideos || [];
  const feed = [...pinned, ...pages.videos.filter((v) => !pinned.some((p) => p.id === v.id))];

  if (pages.loading && pages.page === 0) return <Spinner className="min-h-[60vh]" />;

  // Cards first (videos, with a feed ad after every 6th), then full-width
  // rows after every `shortsEvery` cards — rounded up to whole grid rows on
  // wider screens so no row is left half empty.
  const cards = [];
  feed.forEach((video, index) => {
    cards.push(<FeedCard key={videoId(video)} video={video} eager={index < 2} />);
    const adIndex = (index + 1) / 6 - 1;
    if (Number.isInteger(adIndex) && feedAds[adIndex]) cards.push(<SponsoredCard key={`ad-${feedAds[adIndex].id}`} ad={feedAds[adIndex]} />);
  });
  const chunk = Math.ceil(shortsEvery / columns) * columns;

  // After the Shorts row: Live TV first, then channels, then admin rows.
  const extraRow = (k) => {
    if (k === 0 && liveChannels.length > 1) {
      return (
        <section key="live" className="sm:col-span-2 lg:col-span-3">
          <SectionHeader title="Live TV Channels" to="/live-tv" />
          <ChannelRail>
            {liveChannels.slice(0, 20).map((channel) => (
              <ChannelCircle key={channel._id} name={channel.name} logo={channel.logo} to={`/live-tv/${channel._id}`} live className={railItemClass} />
            ))}
          </ChannelRail>
        </section>
      );
    }
    if (k === 1 && channels.length) {
      return (
        <section key="channels" className="sm:col-span-2 lg:col-span-3">
          <SectionHeader title="Channels to watch" to="/channels" />
          <ChannelRail>
            {channels.map((channel) => (
              <ChannelCircle key={channel.id} name={channel.name} logo={channel.avatar} to={channelPath(channel)} className={railItemClass} />
            ))}
          </ChannelRail>
        </section>
      );
    }
    const section = k >= 2 && sections[k - 2];
    if (!section) return null;
    return (
      // The section reaches past the page gutter (-mx/px) because it skips
      // painting outside its own box, and the row's hover panels and arrow
      // buttons stick out a little.
      <section key={`row-${section.id}`} className="offscreen-lazy -mx-4 min-w-0 px-4 sm:col-span-2 sm:-mx-3 sm:px-3 lg:col-span-3">
        <SectionHeader title={section.title} />
        <VideoRail videos={section.videos} />
      </section>
    );
  };

  // The top ad and Live TV preview already take cells in the first row.
  const lead = (ad?.image ? 1 : 0) + (ownChannel ? 1 : 0);
  const firstChunk = Math.ceil((shortsEvery + lead) / columns) * columns - lead;
  const allLoaded = pages.page >= pages.totalPages;
  const blocks = [];
  let row = 0;
  for (let start = 0, end = firstChunk; start < cards.length; start = end, end += chunk, row += 1) {
    const slice = cards.slice(start, end);
    blocks.push(...slice);
    // A part-filled last row waits for the next page before its rows follow.
    if (start + slice.length < end && !allLoaded) break;
    if (shorts.length) blocks.push(<ShortsShelf key={`shorts-${row}`} videos={shortsForRow(shorts, row)} />);
    const extra = extraRow(row);
    if (extra) blocks.push(extra);
  }
  // A short feed still shows every row the admin set up, at the end.
  if (allLoaded) {
    for (let k = row; k < sections.length + 2; k += 1) {
      const extra = extraRow(k);
      if (extra) blocks.push(extra);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
      {ad?.image && <SponsoredCard ad={ad} />}
      {ownChannel && <LivePreviewCard channel={ownChannel} />}
      {feed.length === 0 && shorts.length === 0 ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <EmptyState icon={CloudUpload} title="No videos yet" text="Be the first to upload — create your channel and share a video or a Short.">
            <StudioLink to="/upload" className="bg-brand-gradient rounded-xl px-5 py-2.5 text-sm font-semibold">
              Upload a video
            </StudioLink>
          </EmptyState>
        </div>
      ) : (
        blocks
      )}
      {feed.length === 0 && shorts.length > 0 && <ShortsShelf videos={shorts} />}
      <div ref={sentinel} className="sm:col-span-2 lg:col-span-3">
        {pages.loading && pages.page > 0 && <Spinner className="py-6" />}
      </div>
    </div>
  );
};

export default Home;
