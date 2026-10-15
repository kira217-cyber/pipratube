import React, { useEffect, useRef, useState } from "react";
import { Check, ShieldAlert, ShieldCheck, Trash2, UserX } from "lucide-react";

import { Card, EmptyState, PageHeader, Spinner } from "../components/ui";
import { Badge, Btn, Pager, TextInput } from "../components/kit";
import { apiError, get, send, SITE_URL } from "../api/client";
import { fullDate } from "../utils/format";
import { toast, confirmDialog } from "../utils/alerts";
import { isOnSite } from "../utils/videos";
import VideoPreviewModal from "../components/VideoPreviewModal";

// Admin → Review queue: videos the automatic adult-content check held back.
// Approve puts a video live with the creator's own visibility; Reject removes
// it and gives the account a strike (3 strikes block it).

const TABS = [
  ["review", "In review"],
  ["rejected", "Rejected"],
  ["approved", "Approved"],
];

const FLAGGED_BY = {
  browser: "Flagged by upload check",
  server: "Flagged by server check",
  fingerprint: "Same as a rejected video",
  reports: "Reported by viewers",
  unchecked: "Couldn't be checked",
};

const clock = (t) => {
  const s = Math.max(0, Math.floor(t || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const ScoreLine = ({ label, check }) =>
  check ? (
    <p className="text-xs text-muted">
      <b className="text-slate-200">{label}:</b>{" "}
      {!check.verdict ? (
        check.state === "error" ? "couldn't read the video" : `${check.state || "waiting"}…`
      ) : (
        <>
          {check.verdict === "flagged" ? <span className="font-semibold text-[#f87171]">flagged</span> : <span className="text-[#4ade80]">clean</span>} · {check.adultFrames || 0} adult frame{check.adultFrames === 1 ? "" : "s"} of {check.checked || 0} · peak {check.peak || 0}%
        </>
      )}
    </p>
  ) : null;

const ReviewCard = ({ video, tab, onDone }) => {
  const [watching, setWatching] = useState(false);
  const player = useRef(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const m = video.moderationDetail;

  const seek = (t) => {
    if (!player.current) return;
    player.current.currentTime = t;
    player.current.play().catch(() => {});
  };

  const act = async (action) => {
    if (action === "reject" && !(await confirmDialog(`Reject "${video.title}"?`, { text: `It will be removed and ${video.owner?.name || "the account"} gets a strike (${(video.owner?.strikes || 0) + 1} of 3).`, confirmText: "Reject" }))) return;
    setBusy(true);
    try {
      const res = await send("post", `/api/admin/moderation/${video.id}/${action}`, { note });
      toast.success(action === "approve" ? "Approved — the video is live" : res?.blocked ? "Rejected — the account was blocked (3 strikes)" : "Rejected");
      onDone(video.id);
    } catch (error) {
      toast.error(apiError(error, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div>
          {video.videoUrl && !m.deletedByOwner && tab !== "rejected" ? (
            <video ref={player} src={video.videoUrl} controls muted playsInline className="aspect-video w-full rounded-xl bg-black" />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-black text-sm text-muted">{m.deletedByOwner ? "Deleted by the creator" : "Video file removed"}</div>
          )}
          {m.evidence.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Flagged frames — click to jump there</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {m.evidence.map((e, i) => (
                  <button key={i} type="button" onClick={() => seek(e.t)} className="group relative cursor-pointer overflow-hidden rounded-lg bg-black text-left">
                    {e.image ? <img src={e.image} alt="" className="aspect-video w-full object-cover blur-[6px] transition group-hover:blur-0" /> : <span className="block aspect-video" />}
                    <span className="absolute left-1 top-1 rounded bg-black/80 px-1 text-[10px] font-semibold">{clock(e.t)}</span>
                    <span className="absolute bottom-1 left-1 rounded bg-[#e3172f]/90 px-1 text-[10px] font-semibold">Porn {Math.round(e.scores?.Porn || 0)}%</span>
                    <span className="absolute right-1 top-1 rounded bg-black/80 px-1 text-[10px]">{e.source}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted">Blurred — hover to see.</p>
            </>
          )}
        </div>

        <div className="min-w-0">
          {isOnSite(video) ? (
            <a href={`${SITE_URL}/watch/${video.id}`} target="_blank" rel="noreferrer" className="line-clamp-2 text-lg font-bold hover:underline">
              {video.title}
            </a>
          ) : (
            <button type="button" onClick={() => setWatching(true)} className="line-clamp-2 cursor-pointer text-left text-lg font-bold hover:underline">
              {video.title}
            </button>
          )}
          {watching && <VideoPreviewModal video={video} onClose={() => setWatching(false)} />}
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge tone={tab === "review" ? "red" : tab === "approved" ? "green" : "gray"}>{TABS.find(([k]) => k === tab)?.[1]}</Badge>
            <Badge>{video.visibility}</Badge>
            {m.flaggedBy && <Badge tone="purple">{FLAGGED_BY[m.flaggedBy] || `Flagged by ${m.flaggedBy}`}</Badge>}
            {m.deletedByOwner && <Badge tone="blue">Deleted by creator</Badge>}
          </div>
          <p className="mt-2 text-sm text-slate-300">
            {video.channel?.name} · {video.owner?.name} {video.owner?.email && <span className="text-muted">({video.owner.email})</span>}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm">
            <UserX className="h-4 w-4 text-[#f87171]" />
            Strikes: <b>{video.owner?.strikes || 0} of 3</b>
            {video.owner?.status === "blocked" && <Badge tone="red">Account blocked</Badge>}
          </p>
          <div className="mt-2 space-y-0.5">
            <ScoreLine label="Upload check" check={m.client} />
            <ScoreLine label="Server check" check={m.server} />
          </div>
          <p className="mt-1 text-xs text-muted">Flagged {m.flaggedAt ? fullDate(m.flaggedAt) : "—"}{m.reviewedAt ? ` · reviewed ${fullDate(m.reviewedAt)}` : ""}</p>
          {m.note && <p className="mt-1 text-xs text-slate-300">Note: {m.note}</p>}

          {tab === "review" && (
            <div className="mt-4 space-y-2">
              <TextInput label="Note (optional, kept with the decision)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. explicit scene at 2:15" />
              <div className="flex flex-wrap gap-2">
                <Btn tone="primary" onClick={() => act("reject")} disabled={busy}>
                  <Trash2 className="h-4 w-4" /> Reject — remove + strike
                </Btn>
                {!m.deletedByOwner && (
                  <Btn onClick={() => act("approve")} disabled={busy}>
                    <Check className="h-4 w-4" /> Approve — it's fine
                  </Btn>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

const Moderation = () => {
  const [tab, setTab] = useState("review");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    get("/api/admin/moderation", { tab, page })
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ items: [], counts: {}, totalPages: 1 }));
    return () => {
      cancelled = true;
    };
  }, [tab, page]);

  return (
    <div>
      <PageHeader title="Review queue" subtitle="Videos the automatic check held back for adult content" />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setPage(1);
              setData(null);
            }}
            className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold ${tab === key ? "bg-white text-black" : "border border-line bg-card-2 hover:bg-white/10"}`}
          >
            {label} {data?.counts?.[key] ? `(${data.counts[key]})` : ""}
          </button>
        ))}
      </div>
      {data === null ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState icon={tab === "review" ? ShieldCheck : ShieldAlert} title={tab === "review" ? "Nothing to review" : "Nothing here yet"} text={tab === "review" ? "Videos the check flags for adult content show up here." : undefined} />
      ) : (
        <div className="space-y-3">
          {data.items.map((video) => (
            <ReviewCard
              key={video.id}
              video={video}
              tab={tab}
              onDone={(id) =>
                setData((d) => ({
                  ...d,
                  items: d.items.filter((v) => v.id !== id),
                  counts: { ...d.counts, review: Math.max(0, (d.counts.review || 1) - 1) },
                }))
              }
            />
          ))}
          <Pager page={page} totalPages={data.totalPages} onPage={setPage} />
        </div>
      )}
    </div>
  );
};

export default Moderation;
