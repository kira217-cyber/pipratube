import React, { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Crown,
  Eye,
  History,
  Landmark,
  MessageSquareText,
  ThumbsUp,
  Users,
  Wallet,
} from "lucide-react";

import { BarChart } from "../components/Charts/Charts";
import { Card, GhostButton, PageHeader, PreviewNotice, SectionHeader, Spinner } from "../components/ui/ui";
import { studioApi } from "../api/studioApi";
import { useAuth } from "../context/AuthContext";
import { useFetch } from "../hooks/useFetch";
import { formatCount, formatMoney } from "../utils/format";
import { demoChannel, demoEarning, demoSeries, demoVideoEarning } from "../utils/demo";
import { GradientTile, RangeSelect, VideoStatRow } from "./shared";
import { toast } from "../utils/alerts";

const MIN_PAYOUT = 50;

const Requirement = ({ icon: Icon, color, target, label, current }) => {
  const done = current >= target;
  const ratio = Math.min(1, current / target);
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-center">
      <Icon className="mx-auto h-7 w-7" style={{ color }} />
      <p className="mt-2 text-base font-bold leading-tight">{formatCount(target)}</p>
      <p className="flex items-center justify-center gap-1 text-xs text-slate-300">
        {label}
        {done && <CheckCircle2 className="h-4 w-4 shrink-0 fill-[#22c55e] text-[#0b0f15]" />}
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#22c55e]" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-[#93c5fd]">
        {formatCount(current)} / {formatCount(target)}
      </p>
    </div>
  );
};

const Earning = () => {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const { data: stats, loading } = useFetch("/api/studio/stats", undefined, studioApi);
  const { data: list } = useFetch("/api/studio/videos", { visibility: "public", sort: "views", limit: 100 }, studioApi);

  const channel = demoChannel(user.id);
  const earning = demoEarning(user.id);
  const daily = useMemo(() => demoSeries(`${user.id}-earn-${days}`, days, earning.total / days), [user.id, days, earning.total]);

  const topEarning = useMemo(
    () =>
      [...(list?.videos || [])]
        .map((video) => ({ video, amount: demoVideoEarning(video) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    [list],
  );

  if (loading || !stats) return <Spinner className="min-h-[60vh]" />;

  const requirements = [
    { icon: Users, color: "#f87171", target: 5000, label: "Subscribers", current: stats.subscribers },
    { icon: Eye, color: "#38bdf8", target: 200000, label: "Video Views", current: stats.views },
    { icon: Clock, color: "#a78bfa", target: 3000, label: "Watch Hours", current: Math.round(channel.watchHours / 50) },
    { icon: ThumbsUp, color: "#fb7185", target: 2000, label: "Likes", current: stats.likes },
    { icon: MessageSquareText, color: "#fbbf24", target: 500, label: "Comments", current: stats.comments },
  ];
  const eligible = requirements.every((item) => item.current >= item.target);
  const periodTotal = daily.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Earning" subtitle="Earn from your creativity. Watch, Grow, Get Paid.">
        <GhostButton onClick={() => toast.info("Payment history will appear here once payouts go live.")}>
          <History className="h-4 w-4" /> Payment History
        </GhostButton>
      </PageHeader>

      <PreviewNotice>
        Monetization isn't live yet, so your earnings are $0 for now. They'll appear here once it starts. Your video views are real.
      </PreviewNotice>

      {/* Monetization program */}
      <div className="rounded-2xl border border-[#7c3aed]/50 bg-gradient-to-br from-[#3b1470] via-[#2a1052] to-[#1a0d33] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-[16rem] flex-1 gap-3">
            <Crown className="h-12 w-12 shrink-0 fill-amber-400 text-amber-300" />
            <div>
              <p className="text-xl font-bold">Monetization Program</p>
              <p className="text-sm text-slate-300">Turn your passion into income</p>
              <p className="mt-3 text-sm text-slate-200">Complete the following requirements to become eligible for monetization.</p>
            </div>
          </div>
          <div className="w-full rounded-xl border border-white/10 bg-black/30 p-3 sm:w-auto sm:max-w-[15rem]">
            <p className={`flex items-center gap-2 text-lg font-bold ${eligible ? "text-[#4ade80]" : "text-amber-300"}`}>
              {eligible ? <CheckCircle2 className="h-6 w-6 fill-[#22c55e] text-[#1a0d33]" /> : <Clock className="h-6 w-6" />}
              {eligible ? "Eligible" : "In progress"}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {eligible ? "You can now earn money from your videos!" : "Keep growing — you're on your way."}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-5">
          {requirements.map((item) => (
            <Requirement key={item.label} {...item} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold sm:text-xl">Earning Overview</h2>
        <RangeSelect value={days} onChange={setDays} options={[7, 30, 90]} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GradientTile icon={CircleDollarSign} label="Total Earnings" value={formatMoney(earning.total)} growth={earning.growth.total} from="#064e3b" to="#06261d" border="#16a34a" />
        <GradientTile icon={Wallet} label="Available Balance" value={formatMoney(earning.available)} growth={earning.growth.available} from="#0c3d66" to="#0a1f36" border="#1e6fd0" />
        <GradientTile icon={Clock} label="Pending Earnings" value={formatMoney(earning.pending)} growth={earning.growth.pending} from="#3b1470" to="#1f0d3d" border="#7c3aed" />
        <GradientTile icon={Landmark} label="Total Paid Out" value={formatMoney(earning.paidOut)} from="#78350f" to="#3d1c07" border="#d97706">
          <p className="mt-1 text-xs text-white/75">{earning.lastPayment ? `Last payment ${earning.lastPayment}` : "No payments yet"}</p>
        </GradientTile>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-semibold">Estimated Earnings</p>
          <p className="flex items-center gap-2 font-bold">
            {formatMoney(periodTotal)}
            {earning.growth.total > 0 && (
              <span className="flex items-center text-sm text-[#4ade80]">
                <ArrowUp className="h-4 w-4" />+{earning.growth.total}%
              </span>
            )}
          </p>
        </div>
        <BarChart data={daily} color="#22c55e" format={(v) => `$${Math.round(v)}`} valueFormat={formatMoney} />
      </Card>

      <section>
        <SectionHeader title="Top Earning Videos" to="/videos" />
        <Card className="px-3 sm:px-4">
          {topEarning.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Your public videos will appear here.</p>
          ) : (
            topEarning.map(({ video, amount }) => (
              <VideoStatRow
                key={video.id}
                video={video}
                right={
                  <span className="flex items-center gap-1.5 font-bold text-[#4ade80] sm:text-lg">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#22c55e] text-xs text-[#0b0f15]">$</span>
                    {formatMoney(amount)}
                  </span>
                }
              />
            ))
          )}
        </Card>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-card-2">
            <Landmark className="h-6 w-6 text-slate-300" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Payout Information</p>
            <p className="text-xs text-muted">Add your payment method to receive earnings.</p>
          </div>
          <Link to="/payout" className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-white/10">
            Manage
          </Link>
        </Card>
        <Card className="flex flex-col justify-center gap-2 p-4">
          <button
            type="button"
            onClick={() =>
              earning.available < MIN_PAYOUT
                ? toast.info(`The minimum payout is ${formatMoney(MIN_PAYOUT)}.`)
                : toast.info("Payouts open once monetization goes live.")
            }
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff9a1f] via-[#ff2d6f] to-[#c026d3] px-5 py-3 font-semibold"
          >
            Request Payout <ChevronRight className="h-5 w-5" />
          </button>
          <p className="text-center text-xs text-muted">Minimum payout amount: {formatMoney(MIN_PAYOUT)}</p>
        </Card>
      </div>
    </div>
  );
};

export default Earning;
