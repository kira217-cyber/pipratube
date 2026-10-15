import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import { Clapperboard, Eye, MessageSquare, ThumbsUp, UserPlus, Users, UsersRound, Zap } from "lucide-react";

import { BarChart } from "../components/Charts";
import { Card, PageHeader, Spinner } from "../components/ui";
import { Badge } from "../components/kit";
import { get, SITE_URL } from "../api/client";
import { formatCount, timeAgo } from "../utils/format";
import { isOnSite } from "../utils/videos";
import VideoPreviewModal from "../components/VideoPreviewModal";

const Tile = ({ icon: Icon, label, value, sub, color }) => (
  <Card className="p-4">
    <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${color}26`, color }}>
      <Icon className="h-5 w-5" />
    </span>
    <p className="mt-3 text-2xl font-bold">{value}</p>
    <p className="text-sm text-muted">{label}</p>
    {sub && <p className="mt-1 text-xs text-[#4ade80]">{sub}</p>}
  </Card>
);

const VideoList = ({ title, videos, metric }) => {
  const [watching, setWatching] = useState(null);
  return (
  <Card className="p-4">
    <p className="mb-3 font-semibold">{title}</p>
    {videos.length === 0 ? (
      <p className="py-8 text-center text-sm text-muted">No videos yet</p>
    ) : (
      <ul className="divide-y divide-line">
        {videos.map((v) => (
          <li key={v.id} className="flex items-center gap-3 py-2.5">
            {isOnSite(v) ? (
              <a href={`${SITE_URL}/watch/${v.id}`} target="_blank" rel="noreferrer" className="w-24 shrink-0 overflow-hidden rounded-lg bg-card-2">
                {v.thumbnail && <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />}
              </a>
            ) : (
              <button type="button" onClick={() => setWatching(v)} className="w-24 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-card-2">
                {v.thumbnail && <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />}
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{v.title}</p>
              <p className="truncate text-xs text-muted">
                {v.channel?.name} · {metric(v)}
              </p>
            </div>
            {v.status === "removed" ? <Badge tone="red">Removed</Badge> : v.isShort ? <Badge tone="purple">Short</Badge> : null}
          </li>
        ))}
      </ul>
    )}
    {watching && <VideoPreviewModal video={watching} onClose={() => setWatching(null)} />}
  </Card>
  );
};

const Dashboard = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    get("/api/admin/dashboard").then(setData).catch(() => setData(false));
  }, []);

  if (data === null) return <Spinner className="min-h-[50vh]" />;
  if (data === false) return <p className="text-muted">Couldn't load the dashboard.</p>;

  const t = data.totals;
  const series = (rows) => rows.map((r) => ({ label: r.label, value: r.count }));

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Everything happening on PipraTube">
        <Link to="/videos/upload" className="bg-brand-gradient rounded-xl px-4 py-2.5 text-sm font-semibold">
          Upload video
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={Users} label="Users" value={formatCount(t.users)} sub={t.usersToday ? `+${t.usersToday} today` : null} color="#2f86e6" />
        <Tile icon={UsersRound} label="Channels" value={formatCount(t.channels)} color="#a855f7" />
        <Tile icon={Clapperboard} label="Videos" value={formatCount(t.videos - t.shorts)} sub={t.videosToday ? `+${t.videosToday} today` : null} color="#ff3d7f" />
        <Tile icon={Zap} label="Shorts" value={formatCount(t.shorts)} color="#f97316" />
        <Tile icon={Eye} label="Total views" value={formatCount(t.views)} color="#22c55e" />
        <Tile icon={ThumbsUp} label="Likes" value={formatCount(t.likes)} color="#ec4899" />
        <Tile icon={MessageSquare} label="Comments" value={formatCount(t.comments)} color="#d97706" />
        <Tile icon={UserPlus} label="Subscriptions" value={formatCount(t.subscriptions)} color="#0ea5e9" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="font-semibold">New users</p>
          <p className="mb-3 text-xs text-muted">Last 14 days</p>
          <BarChart data={series(data.signups)} color="#2f86e6" format={(v) => Math.round(v)} />
        </Card>
        <Card className="p-4">
          <p className="font-semibold">Uploads</p>
          <p className="mb-3 text-xs text-muted">Last 14 days</p>
          <BarChart data={series(data.uploads)} color="#ff3d7f" format={(v) => Math.round(v)} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <VideoList title="Most watched" videos={data.topVideos} metric={(v) => `${formatCount(v.views)} views`} />
        <VideoList title="Latest uploads" videos={data.recentVideos} metric={(v) => timeAgo(v.createdAt)} />
      </div>
    </div>
  );
};

export default Dashboard;
