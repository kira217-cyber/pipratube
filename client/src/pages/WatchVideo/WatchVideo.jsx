import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { BadgeCheck, Bookmark, ChevronDown, ChevronLeft, ChevronRight, Share2, ThumbsDown, ThumbsUp } from "lucide-react";

import VideoPlayer from "../../components/VideoPlayer/VideoPlayer";
import VideoPreview from "../../components/VideoPreview/VideoPreview";
import { VideoCard, cardMenuClass } from "../../components/VideoCard/VideoCard";
import VideoMenu from "../../components/VideoMenu/VideoMenu";
import HiddenNotice from "../../components/VideoMenu/HiddenNotice";
import { clearQueue, hiddenReason, removeFromQueue, useVideoPrefs } from "../../utils/videoPrefs";
import SubscribeButton from "../../components/SubscribeButton/SubscribeButton";
import SaveDialog from "../../components/SaveDialog/SaveDialog";
import ShareDialog from "../../components/ShareDialog/ShareDialog";
import Comments from "../../components/Comments/Comments";
import { Avatar, SectionHeader, Spinner } from "../../components/ui/ui";
import { reactToVideo } from "../../api/engage";
import { apiError, studioApi, TOKEN_KEY } from "../../api/studioApi";
import { api } from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { useRequireSignIn } from "../../hooks/useRequireSignIn";
import { categoryLabel } from "../../utils/categories";
import { channelPath, formatCount, fullDate, timeAgo, videoId, viewsText } from "../../utils/format";
import { countShare, countView } from "../../utils/visitor";
import { toast } from "../../utils/alerts";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import StudioLink from "../../components/StudioLink/StudioLink";

const THEATER_KEY = "pipra_theater";

const Pill = ({ onClick, children, className = "" }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex shrink-0 cursor-pointer items-center gap-2 bg-card-2 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15 ${className}`}
  >
    {children}
  </button>
);

// Compact "up next" row used in the desktop sidebar.
const UpNextRow = ({ video }) => {
  const prefs = useVideoPrefs();
  const hidden = hiddenReason(prefs, video);
  if (hidden) return <HiddenNotice video={video} reason={hidden} className="min-h-[5.5rem]" />;
  return (
    <div className="group/card relative -mx-1.5 flex gap-2.5 rounded-xl p-1.5 transition-colors duration-300 ease-[cubic-bezier(0.2,0,0,1)] [@media(hover:hover)]:hover:bg-white/[0.07]">
      <Link to={`/watch/${videoId(video)}`} className="flex min-w-0 flex-1 gap-2.5">
        <div className="relative w-[168px] shrink-0 overflow-hidden rounded-lg bg-card-2">
          {video.thumbnail && <img src={video.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />}
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px] font-semibold">{video.duration}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-white">{video.title}</p>
          <p className="mt-1 truncate text-xs text-muted">{video.channel?.name}</p>
          <p className="text-xs text-muted">
            {viewsText(video.views)} · {timeAgo(video.publishedAt)}
          </p>
        </div>
      </Link>
      <VideoMenu video={video} className={`${cardMenuClass} -mr-1 mt-0`} />
    </div>
  );
};

// YouTube's Shorts row in the "up next" list: vertical cards that scroll
// sideways, with arrow buttons on desktop.
const ShortsShelf = ({ shorts }) => {
  const rail = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const measure = useCallback(() => {
    const el = rail.current;
    if (el) setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, shorts.length]);
  const scroll = (direction) => rail.current?.scrollBy({ left: direction * rail.current.clientWidth * 0.9, behavior: "smooth" });
  const arrow = "absolute top-[calc(50%-1.75rem)] z-10 hidden h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-[#212121] text-white shadow-lg transition hover:bg-[#3d3d3d] sm:flex";

  return (
    <section className="py-1">
      <p className="mb-2 flex items-center gap-2 text-base font-bold">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#ff1f4b] text-[11px] font-black">S</span> Shorts
      </p>
      <div className="relative">
        <div ref={rail} onScroll={measure} className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:scroll-px-0 sm:px-0">
          {shorts.map((short) => (
            // 2½ cards in view (the half one says "scroll me"), in a 3:4 frame —
            // wider and shorter than a full 9:16 Short.
            <Link key={short.id} to={`/shorts?v=${short.id}`} className="group w-[calc((100%-0.75rem)/2.5)] min-w-[136px] max-w-[190px] shrink-0 snap-start">
              <VideoPreview id={`next-short-${short.id}`} src={short.videoUrl} posterWidth={360} poster={short.thumbnail} alt="" clipSeconds={4} minimal className="aspect-[3/4] rounded-xl bg-card-2" />
              <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-white">{short.title}</p>
              <p className="mt-0.5 text-xs text-muted">{viewsText(short.views)}</p>
            </Link>
          ))}
        </div>
        {!edges.start && (
          <button type="button" aria-label="Previous Shorts" onClick={() => scroll(-1)} className={`${arrow} -left-3`}>
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {!edges.end && (
          <button type="button" aria-label="More Shorts" onClick={() => scroll(1)} className={`${arrow} -right-3`}>
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </section>
  );
};

// Everything below the fetch — keyed by video so all state starts fresh.
const WatchBody = ({ video, viewer }) => {
  useDocumentTitle(video.title);
  const id = video.id;
  const { channel: myChannel } = useAuth();
  const requireSignIn = useRequireSignIn();
  const { data: moreData } = useFetch("/api/videos", { channel: video.channel?.id, exclude: id, limit: 12 });
  const { data: nextData } = useFetch("/api/videos", { sort: "random", exclude: id, limit: 20 });
  const { data: shortsData } = useFetch("/api/videos", { type: "shorts", sort: "random", exclude: id, limit: 12 });
  const navigate = useNavigate();
  // YouTube's theater mode — a wide player with the list below; remembered.
  const [theater, setTheater] = useState(() => {
    try {
      return localStorage.getItem(THEATER_KEY) === "1";
    } catch {
      return false;
    }
  });
  const changeTheater = (value) => {
    setTheater(value);
    try {
      localStorage.setItem(THEATER_KEY, value ? "1" : "0");
    } catch {
      // Not remembered — fine.
    }
  };
  const [filter, setFilter] = useState("all");

  const [reaction, setReaction] = useState(viewer?.reaction || 0);
  const [likes, setLikes] = useState(video.likes || 0);
  const [subscribers, setSubscribers] = useState(video.channel?.subscriberCount || 0);
  const [views, setViews] = useState(video.views);
  const [commentCount, setCommentCount] = useState(video.commentCount || 0);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const channel = video.channel;
  const isMine = myChannel && channel && myChannel.id === channel.id;
  const moreFromChannel = useMemo(() => moreData?.videos || [], [moreData]);
  // Everything worth watching next: this channel's videos and the rest of
  // the site, without repeats. (Filtering out the channel left the list
  // empty when every video is from the same channel.)
  const related = useMemo(() => {
    const seen = new Set([id]);
    return [...(nextData?.videos || []), ...moreFromChannel].filter((item) => !seen.has(item.id) && seen.add(item.id));
  }, [nextData, moreFromChannel, id]);
  const shorts = (shortsData?.videos || []).filter((item) => filter !== "channel" || item.channel?.id === channel?.id);
  // Shorts get their own shelf, so the list itself is regular videos.
  const listed = related.filter((item) => !item.isShort || shorts.length === 0);
  const upNext = filter === "channel" ? listed.filter((item) => item.channel?.id === channel?.id) : listed;
  // Queued videos (⋮ → Add to queue) play before the suggestions.
  const prefs = useVideoPrefs();
  const queue = prefs.queue.filter((item) => item.id !== id);
  useEffect(() => {
    // Watching a queued video takes it off the queue.
    if (prefs.queue.some((item) => item.id === id)) removeFromQueue(id);
  }, [id, prefs.queue]);
  const nextVideo = queue[0] || related.find((item) => !hiddenReason(prefs, item));
  const playNext = nextVideo ? () => navigate(`/watch/${nextVideo.id}`) : undefined;

  const react = async (value) => {
    if (!requireSignIn(value === "like" ? "Sign in to like videos" : "Sign in to rate videos")) return;
    const target = { like: 1, dislike: -1 }[value];
    const next = reaction === target ? 0 : target;
    const before = { reaction, likes };
    setReaction(next);
    setLikes(likes + (next === 1) - (reaction === 1));
    try {
      const result = await reactToVideo(id, next === 1 ? "like" : next === -1 ? "dislike" : "none");
      setLikes(result.likes);
    } catch (error) {
      setReaction(before.reaction);
      setLikes(before.likes);
      toast.error(apiError(error, "Couldn't save"));
    }
  };

  const share = () => setSharing(true);

  return (
    // One grid, three areas — the player never moves in the DOM, so
    // switching theater mode doesn't restart the video:
    //   phones:   player / info / list
    //   desktop:  player | list   (theater: player across the top)
    //             info   | list
    // The first row is only as tall as the player, so the long list on the
    // right never pushes the title down.
    <div
      className={`mx-auto grid max-w-[1760px] grid-cols-1 gap-x-6 gap-y-4 [grid-template-areas:'player'_'info'_'side'] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_402px] ${
        theater ? "lg:[grid-template-areas:'player_player'_'info_side']" : "lg:[grid-template-areas:'player_side'_'info_side']"
      }`}
    >
      <div className={`min-w-0 [grid-area:player] ${theater ? "lg:-mx-8 lg:-mt-6 lg:flex lg:justify-center lg:bg-black" : ""}`}>
        <div className={`-mx-4 overflow-hidden sm:mx-0 ${theater ? "w-full lg:max-w-[calc((100vh-11rem)*16/9)]" : "sm:rounded-2xl"}`}>
          <VideoPlayer
            onNext={playNext}
            nextVideo={nextVideo}
            theater={theater}
            onTheaterChange={changeTheater}
            src={video.hlsUrl || video.videoUrl}
            poster={video.thumbnail}
            title={video.title}
            adsTarget={{ video: id }}
            onStart={() =>
              countView(id).then((response) => {
                const next = response?.data?.data?.views;
                if (next) setViews(next);
              })
            }
          />
        </div>
      </div>

      <div className="min-w-0 [grid-area:info]">
        <h1 className="mt-1 text-lg font-bold leading-snug text-white sm:text-xl">{video.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link to={channelPath(channel)} className="flex min-w-0 items-center gap-3">
            <Avatar src={channel?.avatar} name={channel?.name} size="h-10 w-10" ring={false} />
            <span className="min-w-0">
              <span className="flex items-center gap-1 font-semibold text-white">
                <span className="truncate">{channel?.name}</span>
                {channel?.verified && <BadgeCheck className="h-4 w-4 shrink-0 fill-muted text-page" />}
              </span>
              <span className="block text-xs text-muted">
                {formatCount(subscribers)} {subscribers === 1 ? "subscriber" : "subscribers"}
              </span>
            </span>
          </Link>
          {isMine ? (
            <StudioLink to={`/videos/${id}/edit`} className="rounded-full bg-card-2 px-4 py-2 text-sm font-semibold hover:bg-white/15">
              Edit video
            </StudioLink>
          ) : (
            <SubscribeButton key={channel?.id} channelId={channel?.id} initial={viewer} onCount={setSubscribers} />
          )}

          <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:mx-0 sm:ml-auto sm:w-auto sm:px-0">
            <div className="flex shrink-0 overflow-hidden rounded-full">
              <Pill className="border-r border-white/10" onClick={() => react("like")}>
                <ThumbsUp className={`h-5 w-5 ${reaction === 1 ? "fill-white" : ""}`} />
                {formatCount(likes)}
              </Pill>
              <Pill onClick={() => react("dislike")}>
                <ThumbsDown className={`h-5 w-5 ${reaction === -1 ? "fill-white" : ""}`} />
              </Pill>
            </div>
            <Pill className="rounded-full" onClick={share}>
              <Share2 className="h-5 w-5" /> Share
            </Pill>
            <Pill className="rounded-full" onClick={() => requireSignIn("Sign in to save videos") && setSaving(true)}>
              <Bookmark className="h-5 w-5" /> Save
            </Pill>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-4 block w-full cursor-pointer rounded-xl bg-card-2 p-3 text-left text-sm hover:bg-white/10"
        >
          <p className="font-semibold text-white">
            {expanded ? `${views.toLocaleString("en-US")} ${views === 1 ? "view" : "views"}` : viewsText(views)} ·{" "}
            {expanded ? fullDate(video.publishedAt) : timeAgo(video.publishedAt)}
            {video.tags?.length > 0 && <span className="ml-2 font-normal text-[#3ea6ff]">{video.tags.slice(0, 3).map((tag) => `#${tag}`).join(" ")}</span>}
          </p>
          {video.description ? (
            <p className={`mt-1 whitespace-pre-line text-slate-200 ${expanded ? "" : "line-clamp-2"}`}>{video.description}</p>
          ) : (
            <p className="mt-1 text-muted">No description.</p>
          )}
          {expanded && (
            <p className="mt-3 text-xs text-muted">
              {categoryLabel(video.category)} · {video.duration}
              {video.isShort ? " · Short" : ""}
            </p>
          )}
          <p className="mt-1 text-xs font-semibold text-white">{expanded ? "Show less" : "...more"}</p>
        </button>

        {/* Comments: always open on desktop; a tap-to-open card on phones. */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between rounded-xl bg-card-2 p-3 text-left lg:hidden"
          >
            <span className="font-semibold">
              Comments <span className="font-normal text-muted">{formatCount(commentCount)}</span>
            </span>
            <ChevronDown className={`h-5 w-5 transition ${showComments ? "rotate-180" : ""}`} />
          </button>
          <div className={`${showComments ? "mt-4 block" : "hidden"} lg:block`}>
            <Comments videoId={id} creator={channel} onCountChange={setCommentCount} />
          </div>
        </div>

      </div>

      {related.length > 0 && (
        <aside className="min-w-0 [grid-area:side] lg:self-start">
          {queue.length > 0 && (
            <div className="mb-4 overflow-hidden rounded-xl border border-line bg-card">
              <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
                <p className="text-sm font-bold">
                  Queue <span className="font-normal text-muted">· {queue.length}</span>
                </p>
                <button type="button" onClick={clearQueue} className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-[#3ea6ff] hover:bg-white/10">
                  Clear
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto p-1.5">
                {queue.map((item, index) => (
                  <div key={item.id} className="group flex items-center gap-2 rounded-lg p-1.5 hover:bg-white/5">
                    <span className="w-4 text-center text-xs text-muted">{index + 1}</span>
                    <Link to={`/watch/${item.id}`} className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="w-24 shrink-0 overflow-hidden rounded-md bg-card-2">{item.thumbnail && <img src={item.thumbnail} alt="" className="aspect-video w-full object-cover" />}</span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-xs font-semibold leading-snug text-white">{item.title}</span>
                        <span className="block truncate text-[11px] text-muted">{item.channel?.name}</span>
                      </span>
                    </Link>
                    <button type="button" aria-label="Remove from queue" onClick={() => removeFromQueue(item.id)} className="cursor-pointer rounded-full px-1.5 text-muted hover:bg-white/10 hover:text-white">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {[
              ["all", "All"],
              ["channel", `From ${channel?.name || "this channel"}`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition ${filter === key ? "bg-white text-black" : "bg-card-2 text-white hover:bg-white/15"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {upNext.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nothing here yet.</p>
          ) : (
            <>
              {/* Desktop: compact rows like YouTube's sidebar. */}
              <div className="hidden space-y-2 lg:block">
                {upNext.map((item, index) => (
                  <React.Fragment key={item.id}>
                    <UpNextRow video={item} />
                    {/* The Shorts shelf sits after the first video, like YouTube. */}
                    {index === 0 && shorts.length > 0 && <ShortsShelf shorts={shorts} />}
                  </React.Fragment>
                ))}
              </div>
              {/* Phones / tablets: full cards. */}
              <div className="grid grid-cols-1 gap-y-5 sm:grid-cols-2 sm:gap-x-3 lg:hidden">
                {upNext.map((item, index) => (
                  <React.Fragment key={item.id}>
                    <VideoCard video={item} />
                    {index === 0 && shorts.length > 0 && (
                      <div className="sm:col-span-2">
                        <ShortsShelf shorts={shorts} />
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </>
          )}
        </aside>
      )}

      {saving && <SaveDialog videoId={id} onClose={() => setSaving(false)} />}
      {sharing && <ShareDialog url={`${window.location.origin}/watch/${id}`} title={video.title} onClose={() => setSharing(false)} onShared={() => countShare(id)} />}
    </div>
  );
};

const WatchVideo = () => {
  const { id } = useParams();
  const client = localStorage.getItem(TOKEN_KEY) ? studioApi : api;
  const { data, loading, error } = useFetch(`/api/videos/${id}`, undefined, client);

  if (error) return <Navigate to="/videos" replace />;
  if (loading || !data?.video) return <Spinner className="min-h-[60vh]" />;
  return <WatchBody key={id} video={data.video} viewer={data.viewer} />;
};

export default WatchVideo;
