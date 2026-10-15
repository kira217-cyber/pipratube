import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useParams } from "react-router";
import { ArrowLeft, BadgeCheck, ChevronRight, Clapperboard, Globe, Info, Link2, ListVideo, Mail, MapPin, Play, Search, Share2, TrendingUp, Users, Video, X, Zap } from "lucide-react";

import { VideoGrid, VideoRail } from "../../components/VideoCard/VideoCard";
import { Avatar, Chips, EmptyState, Logo, Spinner } from "../../components/ui/ui";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import SubscribeButton from "../../components/SubscribeButton/SubscribeButton";
import { categoryLabel } from "../../utils/categories";
import { formatCount, fullDate, timeAgo, videoId, viewsText } from "../../utils/format";
import StudioLink from "../../components/StudioLink/StudioLink";
import VideoPreview from "../../components/VideoPreview/VideoPreview";
import VideoMenu from "../../components/VideoMenu/VideoMenu";
import { playableSrc, useHlsSource } from "../../utils/hls";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import ShareDialog from "../../components/ShareDialog/ShareDialog";

// The channel page, laid out like YouTube's: banner, a big avatar with the
// channel's name, handle and counts, a one-line description that opens the
// full "About" dialog, then tabs (with a search inside the channel).

const TABS = ["Home", "Videos", "Shorts", "Playlists"];
const SORTS = [
  { label: "Latest", value: "latest" },
  { label: "Popular", value: "popular" },
  { label: "Oldest", value: "oldest" },
];

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const plural = (count, word) => `${formatCount(count)} ${count === 1 ? word : `${word}s`}`;

const Banner = ({ url }) => (
  <div className="overflow-hidden rounded-xl sm:rounded-2xl">
    {url ? (
      <img src={url} alt="" className="aspect-[6.2/1] w-full object-cover" />
    ) : (
      <div className="relative flex aspect-[6.2/1] items-center justify-center bg-gradient-to-r from-[#2a0818] via-[#120d1f] to-[#2a0818]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,45,111,0.3),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(192,38,211,0.25),transparent_45%)]" />
        <Logo className="relative h-7 opacity-80 sm:h-14" />
      </div>
    )}
  </div>
);

// Shorts tile: tall poster that plays its first seconds on hover, with the
// title and views underneath — as on a YouTube channel.
const ShortTile = ({ video, className = "" }) => (
  <div className={`group/card relative ${className}`}>
    <Link to={`/shorts?v=${video.id}`} className="block overflow-hidden rounded-xl bg-card-2">
      <VideoPreview id={`channel-short-${video.id}`} src={video.videoUrl} posterWidth={360} poster={video.thumbnail} alt={video.title} clipSeconds={4} minimal className="aspect-[9/16]" />
    </Link>
    <div className="mt-2 flex gap-1">
      <Link to={`/shorts?v=${video.id}`} className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{video.title}</p>
        <p className="mt-0.5 text-xs text-muted">{viewsText(video.views)}</p>
      </Link>
      <VideoMenu video={video} className="-mr-2 shrink-0" />
    </div>
  </div>
);

// The big video at the top of the Home tab: it plays (muted) right on the
// page, with its title and description beside it.
const Featured = ({ video }) => {
  const ref = useRef(null);
  useHlsSource(ref, video.hlsUrl || video.videoUrl);
  return (
    <section className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:gap-6">
      <div className="w-full shrink-0 md:w-[46%] lg:w-[424px]">
        <video
          ref={ref}
          src={playableSrc(video.hlsUrl || video.videoUrl)}
          poster={video.thumbnail}
          controls
          muted
          autoPlay
          playsInline
          preload="metadata"
          className="aspect-video w-full rounded-xl bg-black"
        />
      </div>
      <div className="min-w-0 flex-1">
        <Link to={`/watch/${videoId(video)}`} className="line-clamp-2 text-base font-semibold hover:text-white sm:text-lg">
          {video.title}
        </Link>
        <p className="mt-1 text-xs text-muted sm:text-sm">
          {viewsText(video.views)} · {timeAgo(video.publishedAt || video.createdAt)}
        </p>
        {video.description && <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm text-slate-200">{video.description}</p>}
        <Link to={`/watch/${videoId(video)}`} className="mt-3 inline-block text-sm font-semibold uppercase text-white/90 hover:text-white">
          Read more
        </Link>
      </div>
    </section>
  );
};

const Section = ({ title, icon: Icon, onAll, children }) => (
  <section>
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
        {Icon && <Icon className="h-5 w-5 text-live" />}
        {title}
      </h2>
      {onAll && (
        <button type="button" onClick={onAll} className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-white/10">
          View all <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
    {children}
  </section>
);

// "More about this channel" — YouTube's About dialog.
const AboutDialog = ({ channel, subscribers, total, onClose }) => {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const links = channel.links || [];
  const address = `${window.location.origin}/@${channel.handle}`;
  const [sharing, setSharing] = useState(false);
  const row = "flex items-center gap-4";
  const icon = "h-5 w-5 shrink-0 text-white/80";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="About" className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-card p-6 shadow-2xl sm:max-w-[560px] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold">About</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 -mt-1 cursor-pointer rounded-full p-2 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 whitespace-pre-line break-words text-sm text-slate-200">{channel.description || "This channel hasn't added a description yet."}</p>

        {links.length > 0 && (
          <>
            <h3 className="mt-6 text-lg font-bold">Links</h3>
            <ul className="mt-3 space-y-4">
              {links.map((link) => (
                <li key={link.url} className="flex items-start gap-4">
                  <Link2 className={`mt-0.5 ${icon}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{link.title || hostOf(link.url)}</span>
                    <a href={link.url} target="_blank" rel="noreferrer" className="block truncate text-sm text-[#3ea6ff] hover:underline">
                      {link.url.replace(/^https?:\/\//, "")}
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h3 className="mt-6 text-lg font-bold">Channel details</h3>
        <ul className="mt-3 space-y-4 text-sm">
          {channel.contactEmail && (
            <li className={row}>
              <Mail className={icon} />
              <a href={`mailto:${channel.contactEmail}`} className="truncate text-[#3ea6ff] hover:underline">
                {channel.contactEmail}
              </a>
            </li>
          )}
          <li className={row}>
            <Globe className={icon} /> <span className="truncate">{address.replace(/^https?:\/\//, "")}</span>
          </li>
          <li className={row}>
            <Users className={icon} /> {plural(subscribers, "subscriber")}
          </li>
          <li className={row}>
            <Video className={icon} /> {plural(total, "video")}
          </li>
          <li className={row}>
            <TrendingUp className={icon} /> {(channel.totalViews || 0).toLocaleString("en-US")} views
          </li>
          <li className={row}>
            <Info className={icon} /> Joined {fullDate(channel.createdAt)}
          </li>
          {channel.country && (
            <li className={row}>
              <MapPin className={icon} /> {channel.country}
            </li>
          )}
        </ul>

        <button type="button" onClick={() => setSharing(true)} className="mt-6 flex cursor-pointer items-center gap-2 rounded-full bg-card-2 px-4 py-2 text-sm font-semibold hover:bg-white/15">
          <Share2 className="h-4 w-4" /> Share channel
        </button>
        {sharing && <ShareDialog url={address} title={channel.name} onClose={() => setSharing(false)} />}
      </div>
    </div>,
    document.body,
  );
};

const Channel = ({ handle }) => {
  const { id } = useParams();
  const key = handle ? `@${handle}` : id;
  const { channel: mine } = useAuth();
  const { data, loading, error } = useFetch(`/api/channels/${encodeURIComponent(key)}`);
  const channel = data?.channel;
  const cid = channel?.id;
  useDocumentTitle(channel?.name);

  const [tab, setTab] = useState("Home");
  const [sort, setSort] = useState("latest");
  const [subscribers, setSubscribers] = useState(null);
  const [about, setAbout] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);

  const { data: playlistData } = useFetch(cid ? `/api/channels/${cid}/playlists` : null);
  const { data: latestData } = useFetch(cid ? "/api/videos" : null, {
    channel: cid,
    type: "videos",
    sort: "latest",
    limit: 48,
  });
  const { data: sortedData } = useFetch(cid && sort !== "latest" ? "/api/videos" : null, { channel: cid, type: "videos", sort, limit: 48 });
  const { data: shortsData } = useFetch(cid ? "/api/videos" : null, {
    channel: cid,
    type: "shorts",
    sort: "latest",
    limit: 48,
  });
  const { data: popularData } = useFetch(cid ? "/api/videos" : null, {
    channel: cid,
    type: "videos",
    sort: "popular",
    limit: 12,
  });
  const { data: searchData, loading: searching } = useFetch(cid && query ? "/api/videos" : null, { channel: cid, search: query, limit: 48 });

  const latest = useMemo(() => latestData?.videos || [], [latestData]);
  const sorted = sort === "latest" ? latest : sortedData?.videos || [];
  const shorts = shortsData?.videos || [];
  const popular = popularData?.videos || [];
  const found = searchData?.videos || [];

  const playlists = useMemo(() => {
    const groups = new Map();
    latest.forEach((video) => {
      if (!groups.has(video.category)) groups.set(video.category, []);
      groups.get(video.category).push(video);
    });
    return [...groups.entries()].map(([category, list]) => ({ category, list })).sort((a, b) => b.list.length - a.list.length);
  }, [latest]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  if (error) return <Navigate to="/channels" replace />;
  if (loading || !channel) return <Spinner className="min-h-[60vh]" />;

  const isMine = mine?.id === channel.id;
  const subscriberCount = subscribers ?? channel.subscriberCount;
  const userPlaylists = playlistData?.playlists || [];
  const [featured, ...moreVideos] = latest;
  const total = (channel.longCount || 0) + (channel.shortCount || 0);
  const links = channel.links || [];
  const showing = query ? "Search" : tab;

  const openTab = (name) => {
    setQuery("");
    setDraft("");
    setSearchOpen(false);
    setTab(name);
  };

  const runSearch = (event) => {
    event.preventDefault();
    setQuery(draft.trim());
  };

  const details = (
    <>
      <button type="button" onClick={() => setAbout(true)} className="mt-2 flex w-full max-w-2xl cursor-pointer items-center text-left text-sm text-muted hover:text-white">
        <span className="truncate">{channel.description || "More about this channel"}</span>
        <span className="shrink-0 pl-1 font-semibold text-white">...more</span>
      </button>
      {links.length > 0 && (
        <p className="mt-1 truncate text-sm">
          <a href={links[0].url} target="_blank" rel="noreferrer" className="font-semibold text-[#3ea6ff] hover:underline">
            {hostOf(links[0].url)}
          </a>
          {links.length > 1 && (
            <button type="button" onClick={() => setAbout(true)} className="ml-1 cursor-pointer font-semibold text-white hover:underline">
              and {links.length - 1} more link{links.length > 2 ? "s" : ""}
            </button>
          )}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {isMine ? (
          <>
            <StudioLink to="/customize" className="flex-1 rounded-full bg-card-2 px-4 py-2 text-center text-sm font-semibold hover:bg-white/15 sm:flex-none">
              Customize channel
            </StudioLink>
            <StudioLink to="/videos" className="flex-1 rounded-full bg-card-2 px-4 py-2 text-center text-sm font-semibold hover:bg-white/15 sm:flex-none">
              Manage videos
            </StudioLink>
          </>
        ) : (
          <SubscribeButton key={channel.id} channelId={channel.id} initial={data?.viewer} onCount={setSubscribers} />
        )}
      </div>
    </>
  );

  const comingSoon = total === 0 && (
    <EmptyState icon={Clapperboard} title={isMine ? "Upload your first video" : "This channel doesn't have any content"} text={isMine ? "Your videos and Shorts will appear here." : undefined}>
      {isMine && (
        <StudioLink to="/upload" className="bg-brand-gradient rounded-xl px-5 py-2.5 text-sm font-semibold">
          Upload video
        </StudioLink>
      )}
    </EmptyState>
  );

  return (
    <div className="mx-auto max-w-[1284px]">
      <Banner url={channel.banner} />

      <div className="mt-4 flex items-center gap-4 sm:mt-6 sm:items-start sm:gap-6">
        <Avatar src={channel.avatar} name={channel.name} size="h-[72px] w-[72px] sm:h-40 sm:w-40" ring={false} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold leading-tight sm:text-4xl">
            <span className="truncate">{channel.name}</span>
            {channel.verified && <BadgeCheck className="h-5 w-5 shrink-0 fill-muted text-page sm:h-6 sm:w-6" />}
          </h1>
          <p className="mt-1 text-sm text-muted sm:mt-2">
            <span className="font-semibold text-white">@{channel.handle}</span>
            <span className="hidden sm:inline">
              {" "}
              · {plural(subscriberCount, "subscriber")} · {plural(total, "video")}
            </span>
            <span className="block sm:hidden">
              {plural(subscriberCount, "subscriber")} · {plural(total, "video")}
            </span>
          </p>
          <div className="hidden sm:block">{details}</div>
        </div>
      </div>
      <div className="sm:hidden [&_button.rounded-full]:w-full">{details}</div>

      {/* Tabs stay under the header while scrolling, like YouTube. */}
      <div className="sticky top-16 z-30 -mx-4 mt-4 border-b border-line bg-page px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="no-scrollbar flex items-center overflow-x-auto">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => openTab(name)}
              className={`shrink-0 cursor-pointer border-b-2 px-3 py-3 text-[15px] font-semibold transition sm:px-5 ${
                showing === name ? "border-white text-white" : "border-transparent text-muted hover:border-white/40 hover:text-white"
              }`}
            >
              {name}
            </button>
          ))}

          <form onSubmit={runSearch} className={`flex shrink-0 items-center border-b-2 ${searchOpen || query ? "border-white/80" : "border-transparent"}`}>
            <button
              type={searchOpen ? "submit" : "button"}
              aria-label="Search this channel"
              onClick={(event) => {
                if (!searchOpen) {
                  event.preventDefault();
                  setSearchOpen(true);
                }
              }}
              className="cursor-pointer rounded-full p-2.5 text-muted hover:bg-white/10 hover:text-white"
            >
              <Search className="h-5 w-5" />
            </button>
            {(searchOpen || query) && (
              <input
                ref={searchRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.key === "Escape" && openTab(tab)}
                onBlur={() => !draft && !query && setSearchOpen(false)}
                placeholder="Search"
                className="w-36 bg-transparent py-2 pr-2 text-sm text-white outline-none placeholder:text-muted sm:w-56"
              />
            )}
          </form>
        </div>
      </div>

      <div className="mt-6">
        {showing === "Search" && (
          <>
            <button type="button" onClick={() => openTab(tab)} className="mb-4 flex cursor-pointer items-center gap-2 text-sm font-semibold text-muted hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Results for “{query}”
            </button>
            {searching && !searchData ? (
              <Spinner className="min-h-[30vh]" />
            ) : found.length === 0 ? (
              <EmptyState icon={Search} title="This channel has no videos that match" text="Try different words." />
            ) : (
              <VideoGrid videos={found} showChannel={false} />
            )}
          </>
        )}

        {showing === "Home" &&
          (comingSoon || (
            <div className="space-y-8">
              {featured && <Featured key={videoId(featured)} video={featured} />}
              {moreVideos.length > 0 && (
                <Section title="Videos" onAll={() => openTab("Videos")}>
                  <VideoRail videos={moreVideos.slice(0, 12)} showChannel={false} limit={12} />
                </Section>
              )}
              {shorts.length > 0 && (
                <Section title="Shorts" icon={Zap} onAll={() => openTab("Shorts")}>
                  <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                    {shorts.slice(0, 12).map((video) => (
                      <ShortTile key={video.id} video={video} className="w-[40%] shrink-0 sm:w-[23%] lg:w-[15.8%]" />
                    ))}
                  </div>
                </Section>
              )}
              {popular.length > 1 && (
                <Section
                  title="Popular videos"
                  onAll={() => {
                    setSort("popular");
                    openTab("Videos");
                  }}
                >
                  <VideoRail videos={popular} showChannel={false} limit={12} />
                </Section>
              )}
            </div>
          ))}

        {showing === "Videos" && (
          <>
            <Chips items={SORTS} value={sort} onChange={setSort} className="mb-5" />
            {sort !== "latest" && !sortedData ? (
              <Spinner className="min-h-[30vh]" />
            ) : sorted.length === 0 ? (
              <EmptyState icon={Clapperboard} title="No videos yet" />
            ) : (
              <VideoGrid videos={sorted} showChannel={false} />
            )}
          </>
        )}

        {showing === "Shorts" &&
          (shorts.length === 0 ? (
            <EmptyState icon={Zap} title="No Shorts yet" />
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {shorts.map((video) => (
                <ShortTile key={video.id} video={video} />
              ))}
            </div>
          ))}

        {showing === "Playlists" &&
          (playlists.length === 0 && userPlaylists.length === 0 ? (
            <EmptyState icon={ListVideo} title="This channel has no playlists" />
          ) : (
            <div className="space-y-8">
              {userPlaylists.length > 0 && (
                <Section title="Created playlists">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {userPlaylists.map((playlist) => (
                      <Link key={playlist.id} to={`/playlist/${playlist.id}`} className="group block">
                        <div className="relative aspect-video overflow-hidden rounded-xl bg-card-2">
                          {playlist.thumbnail && <img src={playlist.thumbnail} alt="" className="h-full w-full object-cover" />}
                          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-semibold">
                            <ListVideo className="h-3.5 w-3.5" /> {playlist.videoCount} videos
                          </span>
                          <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/70 text-sm font-semibold opacity-0 transition group-hover:opacity-100">
                            <Play className="h-4 w-4 fill-white" /> Play all
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm font-semibold">{playlist.title}</p>
                        <p className="text-xs text-muted group-hover:text-white">View full playlist</p>
                      </Link>
                    ))}
                  </div>
                </Section>
              )}
              {playlists.map((playlist) => (
                <Section key={playlist.category} title={`${categoryLabel(playlist.category)} · ${playlist.list.length} videos`}>
                  <VideoRail videos={playlist.list} showChannel={false} limit={12} />
                </Section>
              ))}
            </div>
          ))}
      </div>

      {about && <AboutDialog channel={channel} subscribers={subscriberCount} total={total} onClose={() => setAbout(false)} />}
    </div>
  );
};

// "/@handle" — the YouTube-style channel address.
export const ChannelByHandle = () => {
  const { at } = useParams();
  if (!at?.startsWith("@") || at.length < 2) return <Navigate to="/" replace />;
  const handle = at.slice(1);
  return <Channel key={handle} handle={handle} />;
};

export default Channel;
