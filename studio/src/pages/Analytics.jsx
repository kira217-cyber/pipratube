import React, { useMemo, useState } from "react";
import { ArrowUp, Clock, DollarSign, Eye, MessageSquare, ThumbsUp, Users } from "lucide-react";

import { AreaChart, DonutChart, RingStat, Sparkbars } from "../components/Charts/Charts";
import { Card, PageHeader, PreviewNotice, SectionHeader, Spinner } from "../components/ui/ui";
import { studioApi } from "../api/studioApi";
import { useAuth } from "../context/AuthContext";
import { useFetch } from "../hooks/useFetch";
import { formatCount, formatMoney } from "../utils/format";
import { DEMO_AUDIENCE, DEMO_TRAFFIC, demoChannel, demoSeries, demoVideoEngagement } from "../utils/demo";
import { GradientTile, RangeSelect, VideoStatRow } from "./shared";

const METRICS = [
  { key: "views", label: "Views", color: "#2f86e6" },
  { key: "watch", label: "Watch Time", color: "#a855f7" },
  { key: "subscribers", label: "Subscribers", color: "#ff3d7f" },
];

const Analytics = () => {
  const { user } = useAuth();
  const [days, setDays] = useState(28);
  const [metric, setMetric] = useState("views");

  const { data: stats, loading } = useFetch("/api/studio/stats", undefined, studioApi);
  const { data: list } = useFetch("/api/studio/videos", { visibility: "public", sort: "views", limit: 100 }, studioApi);

  const demo = demoChannel(user.id);
  // Totals are real; the day-by-day curves, watch time, revenue, audience
  // and traffic are preview data until the server records them.

  // Daily series scaled so the views line adds up to the real total.
  const series = useMemo(() => {
    const totalViews = stats?.views || 0;
    const base = Math.max(1, totalViews / days);
    return {
      views: demoSeries(`${user.id}-views-${days}`, days, base),
      watch: demoSeries(`${user.id}-watch-${days}`, days, demo.watchHours / days),
      subscribers: demoSeries(`${user.id}-subs-${days}`, days, demo.subscribers / 300),
    };
  }, [stats, days, user.id, demo.watchHours, demo.subscribers]);

  const top = useMemo(
    () => [...(list?.videos || [])].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5),
    [list],
  );

  if (loading || !stats) return <Spinner className="min-h-[60vh]" />;

  const active = METRICS.find((item) => item.key === metric);
  const activeSeries = series[metric];
  const headline = metric === "views" ? stats.views : activeSeries.reduce((sum, d) => sum + d.value, 0);
  const sparkline = (key) => series[key].slice(-10).map((d) => d.value);

  return (
    <div className="space-y-5">
      <PageHeader title="Channel Analytics" subtitle="Track your performance and grow your channel">
        <RangeSelect value={days} onChange={setDays} options={[7, 28, 90]} />
      </PageHeader>

      <PreviewNotice>
        Totals (views, likes, comments, subscribers) and your top videos are real. Daily charts, watch time, revenue, audience and traffic show 0 until the server starts recording them.
      </PreviewNotice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GradientTile icon={Eye} label="Total Views" value={formatCount(stats.views)} growth={demo.growth.views} from="#0b4a8f" to="#0a2a52" border="#1e6fd0">
          <Sparkbars values={sparkline("views")} color="#60a5fa" className="absolute bottom-3 right-3" />
        </GradientTile>
        <GradientTile icon={Users} label="Subscribers" value={formatCount(stats.subscribers)} growth={demo.growth.subscribers} from="#4c1d95" to="#2a0f57" border="#7c3aed">
          <Sparkbars values={sparkline("subscribers")} color="#c084fc" className="absolute bottom-3 right-3" />
        </GradientTile>
        <GradientTile icon={ThumbsUp} label="Likes" value={formatCount(stats.likes)} growth={demo.growth.likes} from="#831843" to="#4a0d24" border="#db2777">
          <Sparkbars values={sparkline("views")} color="#f472b6" className="absolute bottom-3 right-3" />
        </GradientTile>
        <GradientTile icon={MessageSquare} label="Comments" value={formatCount(stats.comments)} growth={demo.growth.comments} from="#92400e" to="#4a2306" border="#d97706">
          <Sparkbars values={sparkline("watch")} color="#fbbf24" className="absolute bottom-3 right-3" />
        </GradientTile>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{active.label}</p>
            <p className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
              {metric === "watch" ? `${formatCount(headline)} h` : headline.toLocaleString("en-US")}
              {demo.growth[metric === "watch" ? "watch" : metric] > 0 && (
                <span className="flex items-center text-sm font-semibold text-[#4ade80]">
                  <ArrowUp className="h-4 w-4" />+{demo.growth[metric === "watch" ? "watch" : metric].toFixed(1)}%
                </span>
              )}
            </p>
            <p className="text-sm text-muted">Compared to previous {days} days</p>
          </div>
          <div className="flex rounded-xl border border-line bg-card-2 p-1">
            {METRICS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMetric(item.key)}
                className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium sm:px-4 sm:text-sm ${
                  metric === item.key ? "bg-[#2f86e6] text-white" : "text-slate-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <AreaChart data={activeSeries} color={active.color} format={formatCount} valueFormat={(v) => v.toLocaleString("en-US")} />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <GradientTile icon={Clock} value={`${formatCount(demo.watchHours)}`} from="#1e1b4b" to="#151233" border="#4338ca">
          <p className="text-sm text-white/80">Watch time (hours)</p>
          {demo.growth.watch > 0 && (
            <p className="flex items-center gap-1 text-sm font-semibold text-[#4ade80]">
              <ArrowUp className="h-4 w-4" />+{demo.growth.watch.toFixed(1)}%
            </p>
          )}
          <Sparkbars values={sparkline("watch")} color="#a78bfa" className="absolute bottom-3 right-3" />
        </GradientTile>
        <GradientTile icon={DollarSign} value={formatMoney(demo.revenue)} from="#064e3b" to="#062b22" border="#16a34a">
          <p className="text-sm text-white/80">Revenue (Estimated)</p>
          {demo.growth.revenue > 0 && (
            <p className="flex items-center gap-1 text-sm font-semibold text-[#4ade80]">
              <ArrowUp className="h-4 w-4" />+{demo.growth.revenue.toFixed(1)}%
            </p>
          )}
          <Sparkbars values={sparkline("views")} color="#4ade80" className="absolute bottom-3 right-3" />
        </GradientTile>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 flex items-center gap-2 font-semibold">
            <Users className="h-5 w-5 text-[#2f86e6]" /> Audience
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex gap-4">
              <RingStat value={DEMO_AUDIENCE.male} color="#2f86e6" label="Male" />
              <RingStat value={DEMO_AUDIENCE.female} color="#ff3d7f" label="Female" />
            </div>
            <div className="w-full min-w-0 sm:w-auto sm:min-w-[10rem] sm:flex-1">
              <p className="mb-2 text-xs text-muted">Top age range</p>
              <ul className="space-y-1.5">
                {DEMO_AUDIENCE.ages.map((age) => (
                  <li key={age.label} className="flex items-center gap-2 text-xs">
                    <span className="w-10 text-slate-300">{age.label}</span>
                    <span className="h-2 flex-1 rounded-full bg-white/5">
                      <span className="block h-full rounded-full bg-[#2f86e6]" style={{ width: `${age.value * 2}%` }} />
                    </span>
                    <span className="w-8 text-right font-semibold">{age.value}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <p className="mb-3 font-semibold">Traffic source</p>
          <DonutChart data={DEMO_TRAFFIC} />
        </Card>
      </div>

      <section>
        <SectionHeader title="Top Performing Videos" to="/videos" />
        <Card className="px-3 sm:px-4">
          {top.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Your public videos will be ranked here.</p>
          ) : (
            top.map((video, index) => (
              <VideoStatRow
                key={video.id}
                video={video}
                rank={index + 1}
                right={
                  demoVideoEngagement(video).growth > 0 && (
                    <span className="flex items-center gap-1 text-sm font-semibold text-[#4ade80]">
                      <ArrowUp className="h-4 w-4" />+{demoVideoEngagement(video).growth}%
                    </span>
                  )
                }
              />
            ))
          )}
        </Card>
      </section>
    </div>
  );
};

export default Analytics;
