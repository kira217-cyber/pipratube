import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  AlertTriangle,
  Loader2,
  BarChart3,
  CalendarClock,
  CloudUpload,
  Globe,
  Link2,
  ListFilter,
  Lock,
  MessageSquare,
  Pencil,
  Search,
  Share2,
  ShieldAlert,
  ThumbsUp,
  Trash2,
  Zap,
} from "lucide-react";

import { Avatar, Card, EmptyState, GhostButton, Spinner } from "../components/ui/ui";
import { useAuth } from "../context/AuthContext";
import { apiError, studioApi } from "../api/studioApi";
import { formatCount, fullDate, viewsText } from "../utils/format";
import ReviewWarning from "../components/ReviewWarning";
import { toast } from "../utils/alerts";

const PAGE_SIZE = 20;

const TABS = [
  { label: "All", value: "" },
  { label: "Public", value: "public" },
  { label: "Unlisted", value: "unlisted" },
  { label: "Private", value: "private" },
  { label: "Scheduled", value: "scheduled" },
];

const TYPES = [
  { label: "All", value: "" },
  { label: "Videos", value: "videos" },
  { label: "Shorts", value: "shorts" },
];

const SORTS = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Most viewed", value: "views" },
  { label: "Most liked", value: "likes" },
];

const isScheduled = (video) => new Date(video.publishedAt) > new Date();

export const VisibilityPill = ({ video }) => {
  const meta = video.status === "review"
    ? { label: "In review", icon: ShieldAlert, className: "bg-live/20 text-[#ff6b81]" }
    : video.status === "processing"
    ? { label: "Checking…", icon: Loader2, className: "bg-amber-400/15 text-amber-300", spin: true }
    : video.status === "failed"
      ? { label: "Failed", icon: AlertTriangle, className: "bg-live/15 text-[#f87171]" }
      : video.status === "removed"
    ? { label: "Removed", icon: ShieldAlert, className: "bg-live/15 text-[#f87171]" }
    : isScheduled(video)
      ? { label: "Scheduled", icon: CalendarClock, className: "bg-[#a855f7]/15 text-[#c084fc]" }
      : {
          public: { label: "Public", icon: Globe, className: "bg-[#22c55e]/15 text-[#4ade80]" },
          unlisted: { label: "Unlisted", icon: Link2, className: "bg-[#2f86e6]/15 text-[#60a5fa]" },
          private: { label: "Private", icon: Lock, className: "bg-white/10 text-slate-300" },
        }[video.visibility] || { label: video.visibility, icon: Globe, className: "bg-white/10" };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      <Icon className={`h-3.5 w-3.5 ${meta.spin ? "animate-spin" : ""}`} />
      {meta.label}
    </span>
  );
};

const ActionButton = ({ icon: Icon, label, onClick, danger }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition sm:px-3 sm:text-sm ${
      danger ? "bg-live/80 text-white hover:bg-live" : "border border-line bg-card-2 text-white hover:bg-white/10"
    }`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

const ConfirmDelete = ({ video, busy, onCancel, onConfirm }) => (
  <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center">
    <Card className="w-full max-w-sm p-5">
      <p className="text-lg font-bold">Delete this video forever?</p>
      <p className="mt-2 text-sm text-muted">“{video.title}” and its views, likes and comments will be deleted. This can't be undone.</p>
      <div className="mt-5 flex gap-3">
        <GhostButton onClick={onCancel} className="flex-1" disabled={busy}>
          Cancel
        </GhostButton>
        <button type="button" onClick={onConfirm} disabled={busy} className="flex-1 cursor-pointer rounded-xl bg-live px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
          {busy ? "Deleting..." : "Delete forever"}
        </button>
      </div>
    </Card>
  </div>
);

// Channel content (YouTube Studio → Content): every upload, filterable.
const MyVideos = () => {
  const navigate = useNavigate();
  const { channel } = useAuth();
  const [visibility, setVisibility] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [list, setList] = useState({ key: null, videos: [], page: 1, totalPages: 1, total: 0 });
  const [loadingMore, setLoadingMore] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = { visibility: visibility || undefined, type: type || undefined, sort, search: query || undefined, limit: PAGE_SIZE };
  const listKey = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;
    studioApi
      .get("/api/studio/videos", { params: { ...JSON.parse(listKey), page: 1, refresh: refresh || undefined } })
      .then(({ data }) => {
        if (!cancelled) setList({ key: listKey, videos: data.data.videos, page: 1, totalPages: data.data.totalPages, total: data.data.total });
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(apiError(error, "Couldn't load your videos"));
        setList({ key: listKey, videos: [], page: 1, totalPages: 1, total: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [listKey, refresh]);

  // While anything is processing, refresh just those videos every few seconds.
  const processingIds = list.videos.filter((v) => v.status === "processing").map((v) => v.id).join(",");
  useEffect(() => {
    if (!processingIds) return undefined;
    const timer = setInterval(async () => {
      const updates = await Promise.all(
        processingIds.split(",").map((vid) => studioApi.get(`/api/studio/videos/${vid}`).then(({ data }) => data.data.video).catch(() => null)),
      );
      setList((current) => ({ ...current, videos: current.videos.map((v) => updates.find((u) => u && u.id === v.id) || v) }));
    }, 4000);
    return () => clearInterval(timer);
  }, [processingIds]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = list.page + 1;
      const { data } = await studioApi.get("/api/studio/videos", { params: { ...params, page } });
      setList((previous) => ({ ...previous, videos: [...previous.videos, ...data.data.videos], page }));
    } finally {
      setLoadingMore(false);
    }
  };

  const share = async (video) => {
    if (video.visibility === "private" || isScheduled(video)) {
      toast.info("Only public or unlisted videos can be shared.");
      return;
    }
    const url = `${window.location.origin}/watch/${video.id}`;
    try {
      if (navigator.share) await navigator.share({ title: video.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      // Share sheet dismissed.
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await studioApi.delete(`/api/studio/videos/${toDelete.id}`);
      setList((previous) => ({ ...previous, videos: previous.videos.filter((v) => v.id !== toDelete.id), total: previous.total - 1 }));
      toast.success("Video deleted");
      setToDelete(null);
    } catch (error) {
      toast.error(apiError(error, "Couldn't delete the video"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* Whose content this is, at a glance — the signed-in channel's logo. */}
          {channel && <Avatar src={channel.avatar} name={channel.name} size="h-12 w-12 sm:h-14 sm:w-14" />}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold sm:text-3xl">Channel content</h1>
            <p className="mt-0.5 truncate text-sm text-muted">
              {channel && <span className="font-medium text-slate-200">{channel.name} · </span>}
              {list.key === listKey ? `${list.total} ${list.total === 1 ? "upload" : "uploads"}` : "Loading…"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/upload")}
          className="flex cursor-pointer items-center gap-2 rounded-xl bg-live px-5 py-3 font-semibold shadow-lg shadow-live/25 hover:brightness-110"
        >
          <CloudUpload className="h-5 w-5" /> Upload
        </button>
      </div>

      <div className="mt-5">
        <ReviewWarning onChange={() => setRefresh((n) => n + 1)} />
      </div>

      <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setVisibility(tab.value)}
            className={`shrink-0 cursor-pointer rounded-xl px-4 py-2 text-sm font-medium transition ${
              visibility === tab.value ? "bg-white text-black" : "border border-line bg-card-2 text-slate-200 hover:bg-white/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <label className="flex h-11 min-w-0 flex-1 basis-full items-center gap-2 rounded-xl border border-line bg-card px-3 sm:basis-auto">
          <Search className="h-5 w-5 shrink-0 text-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your videos" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
        </label>
        <div className="flex rounded-xl border border-line bg-card p-1">
          {TYPES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setType(item.value)}
              className={`cursor-pointer rounded-lg px-3 text-sm ${type === item.value ? "bg-card-2 font-semibold text-white" : "text-muted"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-sm">
          <ListFilter className="h-4 w-4 shrink-0" />
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="cursor-pointer bg-transparent outline-none [color-scheme:dark]">
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        {list.key !== listKey ? (
          <Spinner />
        ) : list.videos.length === 0 ? (
          <EmptyState icon={CloudUpload} title="No content here" text={query ? "No videos match your search." : "Upload a video to get started."}>
            <Link to="/upload" className="bg-brand-gradient rounded-xl px-5 py-2.5 text-sm font-semibold">
              Upload video
            </Link>
          </EmptyState>
        ) : (
          <div className="divide-y divide-line">
            {list.videos.map((video) => (
              <div key={video.id} className="space-y-3 py-4">
                <div className="flex gap-3 sm:gap-4">
                  <Link to={`/videos/${video.id}/edit`} className="relative w-[38%] shrink-0 self-start overflow-hidden rounded-xl border border-line bg-card-2 sm:w-56">
                    {video.thumbnail ? (
                      <img src={video.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="aspect-video" />
                    )}
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 text-xs font-semibold">{video.duration}</span>
                    {video.isShort && (
                      <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded bg-live px-1.5 text-[10px] font-bold">
                        <Zap className="h-3 w-3" /> SHORT
                      </span>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium sm:text-base">{video.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted">{video.description || "No description"}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted sm:text-sm">
                      <VisibilityPill video={video} />
                      <span>{isScheduled(video) ? `Goes live ${fullDate(video.publishedAt)}` : fullDate(video.publishedAt)}</span>
                      <span>{viewsText(video.views)}</span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-4 w-4" /> {formatCount(video.likes)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" /> {formatCount(video.commentCount)}
                      </span>
                    </div>
                    {video.status === "removed" && video.removedReason && <p className="mt-1.5 text-xs text-[#f87171]">Removed: {video.removedReason}</p>}
                    {video.status === "failed" && <p className="mt-1.5 text-xs text-[#f87171]">Couldn't process: {video.processing?.error || "please upload it again"}</p>}
                    {video.status === "review" && (
                      <p className="mt-1.5 rounded-lg border border-[#e3172f]/60 bg-[#e3172f]/10 px-2 py-1.5 text-xs font-semibold leading-snug text-[#ff8a9a]">
                        Not public: adult / sexual content was found. Our team will review it — please delete it if it breaks the rules.
                      </p>
                    )}
                    {video.status === "processing" && (
                      <p className="mt-1.5 text-xs leading-snug text-amber-300">
                        Your video has been successfully uploaded. We are currently reviewing its copyright compliance and video quality. Please wait...
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 sm:flex sm:gap-2 sm:pl-60">
                  <ActionButton icon={Pencil} label="Edit" onClick={() => navigate(`/videos/${video.id}/edit`)} />
                  <ActionButton icon={BarChart3} label="Analytics" onClick={() => navigate("/analytics")} />
                  <ActionButton icon={Share2} label="Share" onClick={() => share(video)} />
                  <ActionButton icon={Trash2} label="Delete" danger onClick={() => setToDelete(video)} />
                </div>
              </div>
            ))}
          </div>
        )}

        {list.key === listKey && list.page < list.totalPages && (
          <div className="mt-6 flex justify-center">
            <GhostButton onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading..." : "Load more"}
            </GhostButton>
          </div>
        )}
      </div>

      {toDelete && <ConfirmDelete video={toDelete} busy={deleting} onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />}
    </div>
  );
};

export default MyVideos;
