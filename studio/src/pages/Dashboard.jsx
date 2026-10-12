import React from "react";
import { Link } from "react-router";
import { BarChart3, CircleDollarSign, CloudUpload, Eye, Film, MessageSquare, Palette, ThumbsUp, Users, Zap } from "lucide-react";

import { BarChart } from "../components/Charts/Charts";
import { Avatar, Card, EmptyState, PageHeader, SectionHeader, Spinner, SiteLink } from "../components/ui/ui";
import { studioApi } from "../api/studioApi";
import { useAuth } from "../context/AuthContext";
import { useFetch } from "../hooks/useFetch";
import { categoryLabel } from "../utils/categories";
import { channelPath, formatCount, timeAgo, viewsText } from "../utils/format";
import { VisibilityPill } from "./MyVideos";

const StatTile = ({ icon: Icon, label, value, color }) => (
  <Card className="p-4">
    <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${color}26`, color }}>
      <Icon className="h-5 w-5" />
    </span>
    <p className="mt-3 text-2xl font-bold">{value}</p>
    <p className="text-sm text-muted">{label}</p>
  </Card>
);

const QUICK_ACTIONS = [
  { to: "/upload", label: "Upload video", icon: CloudUpload, color: "#ff2d6f" },
  { to: "/customize", label: "Customize channel", icon: Palette, color: "#7c3aed" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, color: "#16a34a" },
  { to: "/earning", label: "Earning", icon: CircleDollarSign, color: "#d97706" },
];

// Channel dashboard — every number here comes from the server.
const Dashboard = () => {
  const { user, channel } = useAuth();
  const { data: stats, loading } = useFetch("/api/studio/stats", undefined, studioApi);
  const { data: recent } = useFetch("/api/studio/videos", { limit: 5 }, studioApi);

  if (loading || !stats) return <Spinner className="min-h-[60vh]" />;

  const uploads = (stats.uploadsOverTime || []).map((item) => ({ label: item.label, value: item.count }));
  const categories = stats.categoryBreakdown || [];
  const maxCategory = Math.max(1, ...categories.map((item) => item.count));

  return (
    <div className="space-y-6">
      <PageHeader title="Channel dashboard" subtitle={`Welcome back, ${user.name.split(" ")[0]}!`}>
        <Link to="/upload" className="bg-brand-gradient flex items-center gap-2 rounded-xl px-5 py-3 font-semibold">
          <CloudUpload className="h-5 w-5" /> Upload
        </Link>
      </PageHeader>

      <Card className="flex items-center gap-3 p-4">
        <Avatar src={channel.avatar} name={channel.name} size="h-12 w-12" ring={false} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{channel.name}</p>
          <p className="text-sm text-muted">
            @{channel.handle} · {formatCount(stats.subscribers)} subscribers
          </p>
        </div>
        <SiteLink to={channelPath(channel)} className="shrink-0 text-sm font-semibold text-[#3ea6ff]">
          View channel
        </SiteLink>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile icon={Film} label="Videos" value={stats.total - stats.shorts} color="#a855f7" />
        <StatTile icon={Zap} label="Shorts" value={stats.shorts} color="#ff3d7f" />
        <StatTile icon={Eye} label="Views" value={formatCount(stats.views)} color="#2f86e6" />
        <StatTile icon={ThumbsUp} label="Likes" value={formatCount(stats.likes)} color="#22c55e" />
        <StatTile icon={MessageSquare} label="Comments" value={formatCount(stats.comments)} color="#d97706" />
        <StatTile icon={Users} label="Subscribers" value={formatCount(stats.subscribers)} color="#0ea5e9" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <p className="font-semibold">Uploads per month</p>
          <p className="mb-3 text-xs text-muted">Last 6 months</p>
          <BarChart data={uploads} color="#ff3d7f" format={(v) => Math.round(v)} />
        </Card>

        <Card className="p-4">
          <p className="mb-3 font-semibold">Videos by category</p>
          {categories.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No videos yet</p>
          ) : (
            <ul className="space-y-3">
              {categories.slice(0, 6).map((item) => (
                <li key={item.category}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-300">{categoryLabel(item.category)}</span>
                    <span className="font-semibold">{item.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-[#2f86e6]" style={{ width: `${(item.count / maxCategory) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_ACTIONS.map(({ to, label, icon: Icon, color }) => (
          <Link key={to} to={to} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 transition hover:bg-card-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: color }}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold">{label}</span>
          </Link>
        ))}
      </div>

      <section>
        <SectionHeader title="Latest uploads" to="/videos" />
        {recent?.videos?.length ? (
          <Card className="divide-y divide-line">
            {recent.videos.map((video) => (
              <Link key={video.id} to={`/videos/${video.id}/edit`} className="flex items-center gap-3 p-3 hover:bg-white/[0.03]">
                <span className="relative w-28 shrink-0 overflow-hidden rounded-lg bg-card-2">
                  {video.thumbnail && <img src={video.thumbnail} alt="" className="aspect-video w-full object-cover" />}
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-semibold">{video.duration}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{video.title}</p>
                  <p className="text-xs text-muted">
                    {viewsText(video.views)} · {formatCount(video.likes)} likes · {timeAgo(video.publishedAt)}
                  </p>
                </div>
                <VisibilityPill video={video} />
              </Link>
            ))}
          </Card>
        ) : (
          <EmptyState icon={CloudUpload} title="No uploads yet" text="Upload your first video or Short to start your channel.">
            <Link to="/upload" className="bg-brand-gradient rounded-xl px-5 py-2.5 text-sm font-semibold">
              Upload video
            </Link>
          </EmptyState>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
