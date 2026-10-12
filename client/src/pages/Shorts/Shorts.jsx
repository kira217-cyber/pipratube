import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  AlignLeft,
  ArrowLeft,
  Zap,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  EllipsisVertical,
  Heart,
  Link2,
  ListPlus,
  MessageCircle,
  MonitorPlay,
  Music2,
  Play,
  Plus,
  Share2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { Spinner } from "../../components/ui/ui";
import { useFetch } from "../../hooks/useFetch";
import Comments from "../../components/Comments/Comments";
import SaveDialog from "../../components/SaveDialog/SaveDialog";
import ShareDialog from "../../components/ShareDialog/ShareDialog";
import SubscribeButton from "../../components/SubscribeButton/SubscribeButton";
import { reactToVideo } from "../../api/engage";
import { api } from "../../api/axios";
import { studioApi, TOKEN_KEY } from "../../api/studioApi";
import { useAuth } from "../../context/AuthContext";
import { useRequireSignIn } from "../../hooks/useRequireSignIn";
import { formatCount } from "../../utils/format";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import { useWatchPresence } from "../../hooks/useWatchPresence";
import { channelPath, videoId } from "../../utils/format";
import { countShare, countView } from "../../utils/visitor";
import { toast } from "../../utils/alerts";
import { playableSrc, useHlsSource } from "../../utils/hls";
import { setPageTitle, useDocumentTitle } from "../../hooks/useDocumentTitle";
import StudioLink from "../../components/StudioLink/StudioLink";

const TABS = [
  { key: "foryou", label: "For You" },
  { key: "following", label: "Following" },
  { key: "trending", label: "Trending" },
];

const RailButton = ({ icon: Icon, label, active, onClick, fill }) => (
  <button type="button" onClick={onClick} className="flex cursor-pointer flex-col items-center gap-0.5 text-white">
    <Icon
      className={`h-7 w-7 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition active:scale-90 lg:h-8 lg:w-8 ${active ? "fill-live text-live" : fill ? "fill-white" : ""}`}
      strokeWidth={1.75}
    />
    <span className="text-[11px] font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] lg:text-xs">{label}</span>
  </button>
);

const handleOf = (channel) => `@${channel?.handle || "pipratv"}`;

const clock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// A sheet that slides up over the Shorts feed (a side panel on desktop).
// It lives outside the feed so its scrolling, wheel and drags never move to
// the next Short.
const Sheet = ({ title, onClose, children }) =>
  createPortal(
    <div className="fixed inset-0 z-[70]" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/50 lg:bg-black/20" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex h-[72dvh] flex-col rounded-t-3xl border-t border-line bg-card shadow-2xl lg:inset-x-auto lg:bottom-6 lg:right-6 lg:top-24 lg:h-auto lg:w-[440px] lg:rounded-2xl lg:border">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/25 lg:hidden" />
        <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-2">
          <p className="text-base font-bold">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  );

// YouTube-style seek bar: a thin line that thickens under a finger or the
// mouse and can be dragged left and right to scrub through the Short.
const SeekBar = ({ videoRef, progress, duration }) => {
  const [scrub, setScrub] = useState(null); // 0–1 while dragging
  const bar = useRef(null);

  const fraction = (event) => {
    const rect = bar.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  };
  const seek = (value) => {
    const player = videoRef.current;
    if (player?.duration) player.currentTime = value * player.duration;
  };

  const shown = scrub ?? progress;

  return (
    <div
      ref={bar}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const value = fraction(event);
        setScrub(value);
        seek(value);
      }}
      onPointerMove={(event) => {
        if (scrub === null) return;
        const value = fraction(event);
        setScrub(value);
        seek(value);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        setScrub(null);
      }}
      onPointerCancel={() => setScrub(null)}
      className="group absolute inset-x-0 bottom-0 z-20 flex h-6 cursor-pointer touch-none items-end"
    >
      {scrub !== null && duration > 0 && (
        <span className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded-lg bg-black/70 px-3 py-1 text-sm font-semibold tabular-nums text-white">
          {clock(shown * duration)} / {clock(duration)}
        </span>
      )}
      <div className={`relative w-full bg-white/25 transition-[height] ${scrub !== null ? "h-1.5" : "h-[3px] group-hover:h-1.5"}`}>
        <div className="h-full bg-brand" style={{ width: `${shown * 100}%` }} />
        <span
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow transition-opacity ${scrub !== null ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          style={{ left: `${shown * 100}%` }}
        />
      </div>
    </div>
  );
};

const ShortItem = ({ video, muted, onToggleMute }) => {
  const id = videoId(video);
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const counted = useRef(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const { channel: myChannel } = useAuth();
  const requireSignIn = useRequireSignIn();
  const [viewer, setViewer] = useState(null); // loaded when this short first plays
  const [likes, setLikes] = useState(video.likes || 0);
  const [commentCount, setCommentCount] = useState(video.commentCount || 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shortUrl = `${window.location.origin}/shorts?v=${id}`;
  const liked = viewer?.reaction === 1;
  const isMine = myChannel && myChannel.id === video.channel?.id;

  const loadViewer = () => {
    if (viewer || !localStorage.getItem(TOKEN_KEY)) return;
    (localStorage.getItem(TOKEN_KEY) ? studioApi : api)
      .get(`/api/videos/${id}`)
      .then(({ data }) => {
        setViewer(data.data.viewer || { reaction: 0, subscribed: false });
        setLikes(data.data.video.likes);
      })
      .catch(() => {});
  };

  const toggleLike = async () => {
    if (!requireSignIn("Sign in to like Shorts")) return;
    const next = liked ? 0 : 1;
    setViewer((v) => ({ ...(v || {}), reaction: next }));
    setLikes((n) => n + (next ? 1 : -1));
    try {
      const result = await reactToVideo(id, next ? "like" : "none");
      setLikes(result.likes);
    } catch {
      setViewer((v) => ({ ...(v || {}), reaction: liked ? 1 : 0 }));
      setLikes(video.likes || 0);
    }
  };

  useWatchPresence("video", playing ? id : null, video.title);

  // Play the short that's on screen, pause the rest.
  useEffect(() => {
    const el = containerRef.current;
    const player = videoRef.current;
    if (!el || !player) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          player.play().catch(() => {});
          setPageTitle(video.title);
        } else player.pause();
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [video.title]);

  useHlsSource(videoRef, video.videoUrl);

  const togglePlay = () => {
    const player = videoRef.current;
    if (!player) return;
    if (player.paused) player.play().catch(() => {});
    else player.pause();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shortUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const share = () => setSharing(true);

  const menuItems = [
    { label: "Description", icon: AlignLeft, run: () => setDescriptionOpen(true) },
    { label: "Save to playlist", icon: ListPlus, run: () => requireSignIn("Sign in to save Shorts") && setSaving(true) },
    { label: "Copy link", icon: Link2, run: copyLink },
    { label: "Open in player", icon: MonitorPlay, run: () => navigate(`/watch/${id}`) },
  ];

  return (
    <div ref={containerRef} className="relative flex h-full w-full justify-center">
      <div className="relative h-full w-full overflow-hidden bg-black lg:aspect-[9/16] lg:w-auto lg:rounded-2xl">
        <video
          ref={videoRef}
          src={playableSrc(video.videoUrl)}
          poster={video.thumbnail || undefined}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          onClick={togglePlay}
          onPlay={() => {
            if (!counted.current) {
              counted.current = true;
              loadViewer();
              countView(id);
            }
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
          onTimeUpdate={(event) => {
            const { currentTime, duration } = event.currentTarget;
            if (duration) setProgress(currentTime / duration);
          }}
          className="h-full w-full cursor-pointer object-contain"
        />

        {!playing && (
          <button
            type="button"
            aria-label="Play"
            onClick={togglePlay}
            className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
          >
            <Play className="ml-1 h-9 w-9 fill-white text-white" />
          </button>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

        <div className="absolute right-2 top-[max(0.75rem,env(safe-area-inset-top))] flex gap-1">
          <button
            type="button"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={onToggleMute}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white"
          >
            {muted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label="More actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white"
            >
              <EllipsisVertical className="h-5 w-5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-11 z-40 w-52 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-2xl">
                  {menuItems.map(({ label, icon: Icon, run }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        run();
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-white/10"
                    >
                      <Icon className="h-[18px] w-[18px]" /> {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right-hand action rail */}
        <div className="absolute bottom-20 right-1.5 z-10 flex flex-col items-center gap-4 sm:right-3 lg:bottom-24 lg:gap-5">
          <Link to={channelPath(video.channel)} className="relative mb-1.5">
            <span className="block h-11 w-11 overflow-hidden rounded-full border-2 border-white bg-black lg:h-12 lg:w-12">
              {video.channel?.avatar ? (
                <img src={video.channel.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-bold uppercase text-brand">
                  {(video.channel?.name || "P").slice(0, 2)}
                </span>
              )}
            </span>
            {!viewer?.subscribed && !isMine && (
              <span className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-live">
                <Plus className="h-3.5 w-3.5 text-white" strokeWidth={3} />
              </span>
            )}
          </Link>
          <RailButton icon={Heart} label={likes ? formatCount(likes) : "Like"} active={liked} onClick={toggleLike} fill />
          <RailButton icon={MessageCircle} label={commentCount ? formatCount(commentCount) : "Comment"} fill onClick={() => setCommentsOpen(true)} />
          <RailButton icon={Share2} label="Share" fill onClick={share} />
        </div>

        {/* Channel + caption. Its empty space lets taps through, so it never
            covers the Like / Comment / Share buttons on short screens. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-3.5 pr-16 lg:p-4 lg:pr-20">
          <div className="pointer-events-auto flex w-fit max-w-full items-center gap-2">
            <Link to={channelPath(video.channel)} className="flex min-w-0 items-center gap-1">
              <span className="truncate text-sm font-semibold text-white">{handleOf(video.channel)}</span>
              {video.channel?.verified && <BadgeCheck className="h-4 w-4 shrink-0 fill-[#2f86e6] text-white" />}
            </Link>
            {!isMine && (
              <SubscribeButton
                key={`${video.channel?.id}-${viewer ? "v" : "x"}`}
                channelId={video.channel?.id}
                initial={viewer}
                size="sm"
              />
            )}
          </div>
          <Link to={`/watch/${id}`} className="pointer-events-auto mt-1.5 line-clamp-1 block text-[13px] leading-snug text-white/95 lg:line-clamp-2 lg:text-sm">
            {video.title}
          </Link>
          {video.category && <p className="mt-0.5 truncate text-xs text-white/70">#PipraTube #{video.category} #Shorts</p>}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-white/80">
            <Music2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Original Sound - {video.channel?.name || "PipraTube"}</span>
          </p>
        </div>

        {commentsOpen && (
          <Sheet title="Comments" onClose={() => setCommentsOpen(false)}>
            <Comments videoId={id} creator={video.channel} onCountChange={setCommentCount} />
          </Sheet>
        )}

        {descriptionOpen && (
          <Sheet title="Description" onClose={() => setDescriptionOpen(false)}>
            <p className="text-base font-semibold leading-snug">{video.title}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                [formatCount(likes), "Likes"],
                [formatCount(video.views || 0), "Views"],
                [new Date(video.publishedAt || video.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }), "Published"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl bg-card-2 py-2.5">
                  <p className="text-sm font-bold">{value}</p>
                  <p className="text-xs text-muted">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 whitespace-pre-line text-sm text-slate-300">{video.description || "No description."}</p>
            <Link to={channelPath(video.channel)} className="mt-4 flex items-center gap-3 rounded-xl bg-card-2 p-3">
              <span className="h-10 w-10 overflow-hidden rounded-full bg-black">{video.channel?.avatar && <img src={video.channel.avatar} alt="" className="h-full w-full object-cover" />}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{video.channel?.name}</span>
                <span className="block text-xs text-muted">{handleOf(video.channel)}</span>
              </span>
            </Link>
          </Sheet>
        )}

        {saving && <SaveDialog videoId={id} onClose={() => setSaving(false)} />}
        {sharing && <ShareDialog url={shortUrl} title={video.title} onClose={() => setSharing(false)} onShared={() => countShare(id)} />}

        <SeekBar videoRef={videoRef} progress={progress} duration={duration} />
      </div>
    </div>
  );
};

const SWIPE_PX = 50;

const Shorts = () => {
  useDocumentTitle("Shorts");
  const navigate = useNavigate();
  const [tab, setTab] = useState("foryou");
  const [muted, setMuted] = useState(true);
  const [index, setIndex] = useState(0);
  const feedRef = useRef(null);
  const drag = useRef(null);
  const wheelLock = useRef(0);
  const [searchParams] = useSearchParams();
  const startId = searchParams.get("v");
  const { settings } = useSiteSettings();
  const { data, loading } = useFetch("/api/videos", { type: "shorts", sort: "random", limit: 30 });
  // Opened from a Short on Home / a channel: start with that one.
  const { data: first } = useFetch(startId ? `/api/videos/${startId}` : null);

  const videos = useMemo(() => {
    const pool = data?.videos || [];
    const pinned = settings?.home?.pinnedShorts || [];
    const lead = [...(first?.video?.isShort ? [first.video] : []), ...pinned].filter((v, i, all) => all.findIndex((x) => x.id === v.id) === i);
    const list = [...lead, ...pool.filter((video) => !lead.some((l) => l.id === video.id))];
    if (tab === "trending") return [...list].sort((a, b) => (b.views || 0) - (a.views || 0));
    return list;
  }, [data, first, tab, settings]);

  // A shared link (?v=…) puts its Short first. It can arrive after the
  // random feed is already on screen; the browser would then keep the old
  // first Short in view and push the linked one above it — so jump back to
  // the top, to the Short that was linked.
  const firstId = first?.video?.isShort ? first.video.id : null;
  useEffect(() => {
    if (firstId && feedRef.current) feedRef.current.scrollTop = 0;
  }, [firstId]);

  // The feed owns the gestures on this page — stop the page behind it
  // from scrolling (or bouncing) at the same time.
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, []);

  const goTo = (next) => {
    const feed = feedRef.current;
    if (!feed || !videos.length) return;
    const target = Math.max(0, Math.min(videos.length - 1, next));
    feed.scrollTo({ top: target * feed.clientHeight, behavior: "smooth" });
  };

  const current = () => {
    const feed = feedRef.current;
    return feed ? Math.round(feed.scrollTop / Math.max(1, feed.clientHeight)) : 0;
  };

  // Keyboard: arrow keys / J-K move between shorts.
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.("input, textarea")) return;
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        goTo(current() + 1);
      } else if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        goTo(current() - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Touch swipes scroll natively (scroll-snap); a mouse can drag too.
  const onPointerDown = (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag.current = { y: event.clientY, from: current() };
  };
  const onPointerUp = (event) => {
    if (!drag.current) return;
    const delta = drag.current.y - event.clientY;
    const from = drag.current.from;
    drag.current = null;
    if (Math.abs(delta) > SWIPE_PX) goTo(from + (delta > 0 ? 1 : -1));
  };

  // One wheel flick = one short (trackpads fire dozens of events).
  const onWheel = (event) => {
    event.preventDefault();
    const now = Date.now();
    if (now - wheelLock.current < 600 || Math.abs(event.deltaY) < 8) return;
    wheelLock.current = now;
    goTo(current() + (event.deltaY > 0 ? 1 : -1));
  };

  // React's onWheel is passive; attach a real listener so preventDefault works.
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return undefined;
    feed.addEventListener("wheel", onWheel, { passive: false });
    return () => feed.removeEventListener("wheel", onWheel);
  });

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return (
    <div className="relative flex h-[100dvh] flex-col bg-black lg:h-[calc(100dvh-4rem)] lg:bg-transparent">
      {/* Back — the only way out on phones, where the top bar is hidden. */}
      <button
        type="button"
        aria-label="Back"
        onClick={goBack}
        className="absolute left-2 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm lg:hidden"
      >
        <ArrowLeft className="h-6 w-6" />
      </button>

      <div className="hidden items-center justify-between gap-2 px-4 py-3 lg:flex lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Back"
            onClick={goBack}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-card-2 text-white hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold">Shorts</h1>
        </div>
        <div className="flex rounded-2xl border border-line bg-card p-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`cursor-pointer whitespace-nowrap rounded-xl px-5 py-2 text-sm font-medium transition ${
                tab === item.key ? "bg-card-2 text-white shadow-[inset_0_-2px_0_#2f86e6]" : "text-slate-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:px-8 lg:pb-4">
        {loading ? (
          <Spinner className="h-full" />
        ) : tab === "following" ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Heart className="h-12 w-12 text-brand" />
            <p className="mt-3 text-lg font-semibold">Follow creators you love</p>
            <p className="mt-1 max-w-sm text-sm text-muted">Shorts from channels you subscribe to will show up here.</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Zap className="h-12 w-12 text-brand" />
            <p className="mt-3 text-lg font-semibold">No Shorts yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted">Upload a video of 2 minutes or less and it shows up here.</p>
            <StudioLink to="/upload" className="bg-brand-gradient mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold">
              Upload a Short
            </StudioLink>
          </div>
        ) : (
          <>
            <div
              ref={feedRef}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerLeave={() => (drag.current = null)}
              onScroll={(event) => setIndex(Math.round(event.currentTarget.scrollTop / Math.max(1, event.currentTarget.clientHeight)))}
              className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overflow-x-hidden overscroll-contain"
            >
              {videos.map((video) => (
                <div key={videoId(video)} className="h-full snap-start snap-always lg:py-2">
                  <ShortItem video={video} muted={muted} onToggleMute={() => setMuted((value) => !value)} />
                </div>
              ))}
            </div>

            {/* Desktop: previous / next buttons beside the player */}
            <div className="absolute right-8 top-1/2 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
              <button
                type="button"
                aria-label="Previous short"
                disabled={index === 0}
                onClick={() => goTo(index - 1)}
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-card-2 text-white transition hover:bg-white/15 disabled:cursor-default disabled:opacity-30"
              >
                <ChevronUp className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Next short"
                disabled={index >= videos.length - 1}
                onClick={() => goTo(index + 1)}
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-card-2 text-white transition hover:bg-white/15 disabled:cursor-default disabled:opacity-30"
              >
                <ChevronDown className="h-6 w-6" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Shorts;
