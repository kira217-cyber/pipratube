import React, { useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Clock, Globe, History as HistoryIcon, Link2, ListVideo, Lock, Play, ThumbsUp, Trash2, Users, X } from "lucide-react";

import { VideoCard, VideoGrid } from "../../components/VideoCard/VideoCard";
import ChannelCircle, { ChannelRail, railItemClass } from "../../components/ChannelCircle/ChannelCircle";
import { Avatar, Card, EmptyState, GhostButton, PageHeader, SectionHeader, Spinner } from "../../components/ui/ui";
import { apiError, studioApi, TOKEN_KEY } from "../../api/studioApi";
import { api } from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useFetch } from "../../hooks/useFetch";
import { channelPath, timeAgo, viewsText } from "../../utils/format";
import { toast, confirmDialog } from "../../utils/alerts";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import StudioLink from "../../components/StudioLink/StudioLink";

const Rail = ({ videos }) => (
  <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
    {videos.map((video) => (
      <VideoCard key={video.id} video={video} className="w-[44%] shrink-0 sm:w-[31%] lg:w-[23%] xl:w-[18.8%]" />
    ))}
  </div>
);

const PlaylistTile = ({ playlist }) => {
  const Icon = playlist.kind === "watch_later" ? Clock : ListVideo;
  return (
    <Link to={`/playlist/${playlist.id}`} className="group block">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-card-2">
        {playlist.thumbnail && <img src={playlist.thumbnail} alt="" className="h-full w-full object-cover" />}
        <span className="absolute inset-y-0 right-0 flex w-2/5 flex-col items-center justify-center gap-1 bg-black/75 text-sm font-semibold">
          <Icon className="h-5 w-5" /> {playlist.videoCount}
        </span>
      </div>
      <p className="mt-2 line-clamp-1 text-sm font-semibold group-hover:text-white">{playlist.title}</p>
      <p className="text-xs capitalize text-muted">{playlist.kind === "watch_later" ? "Private" : playlist.visibility} · Playlist</p>
    </Link>
  );
};

// "You" — YouTube's library page: history, Watch later, playlists, likes.
export const You = () => {
  const { user, channel } = useAuth();
  const { data: history } = useFetch("/api/me/history", { limit: 12 }, studioApi);
  const { data: liked } = useFetch("/api/me/liked", { limit: 12 }, studioApi);
  const { data: lists } = useFetch("/api/me/playlists", undefined, studioApi);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Avatar src={channel?.avatar || user.avatar} name={channel?.name || user.name} size="h-20 w-20" ring={false} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{channel?.name || user.name}</h1>
          <p className="text-sm text-muted">
            {channel ? (
              <>
                @{channel.handle} ·{" "}
                <Link to={channelPath(channel)} className="text-[#3ea6ff] hover:underline">
                  View channel
                </Link>
              </>
            ) : (
              <StudioLink to="/channel/create" className="text-[#3ea6ff] hover:underline">
                Create a channel
              </StudioLink>
            )}
          </p>
        </div>
      </div>

      <section>
        <SectionHeader title="History" to="/feed/history" action="View all" />
        {history === null ? <Spinner className="py-6" /> : history.items.length ? <Rail videos={history.items.map((i) => i.video)} /> : <p className="text-sm text-muted">Videos you watch will show up here.</p>}
      </section>

      <section>
        <SectionHeader title="Playlists" />
        {!lists ? (
          <Spinner className="py-6" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {lists.playlists.map((playlist) => (
              <PlaylistTile key={playlist.id} playlist={playlist} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Liked videos" to="/feed/liked" action="View all" />
        {liked === null ? <Spinner className="py-6" /> : liked.videos.length ? <Rail videos={liked.videos} /> : <p className="text-sm text-muted">Videos you like will show up here.</p>}
      </section>
    </div>
  );
};

export const SubscriptionsFeed = () => {
  const [type, setType] = useState("");
  const { data: subs } = useFetch("/api/me/subscriptions", undefined, studioApi);
  const { data: feed, loading } = useFetch("/api/feed/subscriptions", { type: type || undefined, limit: 48 }, studioApi);
  const channels = subs?.channels || [];

  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" />
      {channels.length > 0 && (
        <ChannelRail>
          {channels.map((channel) => (
            <ChannelCircle key={channel.id} name={channel.name} logo={channel.avatar} to={channelPath(channel)} className={railItemClass} />
          ))}
        </ChannelRail>
      )}
      <div className="flex gap-2">
        {[
          ["", "All"],
          ["videos", "Videos"],
          ["shorts", "Shorts"],
        ].map(([value, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setType(value)}
            className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-medium ${type === value ? "bg-white text-black" : "bg-card-2 text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <Spinner />
      ) : !feed?.videos?.length ? (
        <EmptyState icon={Users} title={channels.length ? "No new videos" : "Don't miss new videos"} text="Subscribe to channels and their latest uploads will appear here.">
          <Link to="/channels" className="bg-brand-gradient rounded-xl px-5 py-2.5 text-sm font-semibold">
            Find channels
          </Link>
        </EmptyState>
      ) : (
        <VideoGrid videos={feed.videos} />
      )}
    </div>
  );
};

export const History = () => {
  const { data, loading } = useFetch("/api/me/history", { limit: 60 }, studioApi);
  const [removed, setRemoved] = useState(new Set());
  const [cleared, setCleared] = useState(false);
  const items = cleared ? [] : (data?.items || []).filter((item) => !removed.has(item.video.id));

  const remove = async (videoId) => {
    setRemoved((set) => new Set(set).add(videoId));
    await studioApi.delete(`/api/me/history/${videoId}`).catch(() => {});
  };

  const clear = async () => {
    if (!(await confirmDialog("Clear your whole watch history?"))) return;
    try {
      await studioApi.delete("/api/me/history");
      setCleared(true);
      toast.success("Watch history cleared");
    } catch (error) {
      toast.error(apiError(error, "Couldn't clear history"));
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Watch history">
        {items.length > 0 && (
          <GhostButton onClick={clear}>
            <Trash2 className="h-4 w-4" /> Clear all
          </GhostButton>
        )}
      </PageHeader>
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="This list has no videos" text="Videos you watch while signed in will show up here." />
      ) : (
        <div className="space-y-4">
          {items.map(({ video, watchedAt }) => (
            <div key={video.id} className="flex gap-3">
              <Link to={`/watch/${video.id}`} className="relative w-[44%] shrink-0 overflow-hidden rounded-xl bg-card-2 sm:w-64">
                {video.thumbnail && <img src={video.thumbnail} alt="" className="aspect-video w-full object-cover" />}
                <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-xs font-semibold">{video.duration}</span>
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/watch/${video.id}`} className="line-clamp-2 font-semibold hover:text-white">
                  {video.title}
                </Link>
                <p className="mt-1 text-xs text-muted">
                  {video.channel?.name} · {viewsText(video.views)}
                </p>
                <p className="text-xs text-muted">Watched {timeAgo(watchedAt)}</p>
              </div>
              <button type="button" aria-label="Remove from history" onClick={() => remove(video.id)} className="h-9 w-9 shrink-0 cursor-pointer rounded-full text-muted hover:bg-white/10 hover:text-white">
                <X className="mx-auto h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const Liked = () => {
  const { data, loading } = useFetch("/api/me/liked", { limit: 60 }, studioApi);
  return (
    <div>
      <PageHeader title="Liked videos" subtitle={data ? `${data.total} videos` : undefined} />
      {loading ? <Spinner /> : !data?.videos?.length ? <EmptyState icon={ThumbsUp} title="No liked videos yet" /> : <VideoGrid videos={data.videos} />}
    </div>
  );
};

const VIS = { public: [Globe, "Public"], unlisted: [Link2, "Unlisted"], private: [Lock, "Private"] };

export const PlaylistPage = () => {
  const { id } = useParams();
  const client = localStorage.getItem(TOKEN_KEY) ? studioApi : api;
  const { data, loading, error } = useFetch(`/api/playlists/${id}`, undefined, client);
  const [removed, setRemoved] = useState(new Set());
  useDocumentTitle(data?.playlist?.title);

  if (error) return <Navigate to="/" replace />;
  if (loading || !data) return <Spinner className="min-h-[60vh]" />;

  const playlist = data.playlist;
  const videos = playlist.videos.filter((v) => !removed.has(v.id));
  const [VisIcon, visLabel] = VIS[playlist.visibility] || VIS.private;

  const remove = async (videoId) => {
    setRemoved((set) => new Set(set).add(videoId));
    try {
      await studioApi.post(`/api/playlists/${playlist.id}/videos`, { video: videoId, add: false });
    } catch {
      toast.error("Couldn't remove");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="h-fit overflow-hidden bg-gradient-to-b from-brand/25 to-card p-4 lg:sticky lg:top-20">
        <div className="aspect-video overflow-hidden rounded-xl bg-card-2">
          {playlist.thumbnail && <img src={playlist.thumbnail} alt="" className="h-full w-full object-cover" />}
        </div>
        <h1 className="mt-4 text-2xl font-bold">{playlist.title}</h1>
        {playlist.channel && (
          <Link to={channelPath(playlist.channel)} className="mt-1 block text-sm font-semibold hover:underline">
            by {playlist.channel.name}
          </Link>
        )}
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <VisIcon className="h-3.5 w-3.5" /> {playlist.kind === "watch_later" ? "Private" : visLabel} · {videos.length} videos
        </p>
        {playlist.description && <p className="mt-3 whitespace-pre-line text-sm text-slate-300">{playlist.description}</p>}
        {videos.length > 0 && (
          <Link to={`/watch/${videos[0].id}`} className="mt-4 flex items-center justify-center gap-2 rounded-full bg-white py-2.5 text-sm font-semibold text-black">
            <Play className="h-4 w-4 fill-black" /> Play all
          </Link>
        )}
      </Card>

      <div>
        {videos.length === 0 ? (
          <EmptyState icon={ListVideo} title="No videos in this playlist yet" />
        ) : (
          <ol className="space-y-3">
            {videos.map((video, index) => (
              <li key={video.id} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-center text-sm text-muted">{index + 1}</span>
                <Link to={`/watch/${video.id}`} className="relative w-40 shrink-0 overflow-hidden rounded-lg bg-card-2 sm:w-48">
                  {video.thumbnail && <img src={video.thumbnail} alt="" className="aspect-video w-full object-cover" />}
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px] font-semibold">{video.duration}</span>
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/watch/${video.id}`} className="line-clamp-2 text-sm font-semibold hover:text-white">
                    {video.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {video.channel?.name} · {viewsText(video.views)}
                  </p>
                </div>
                {playlist.isOwner && (
                  <button type="button" aria-label="Remove from playlist" onClick={() => remove(video.id)} className="h-9 w-9 shrink-0 cursor-pointer rounded-full text-muted hover:bg-white/10 hover:text-white">
                    <X className="mx-auto h-5 w-5" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

export default You;
