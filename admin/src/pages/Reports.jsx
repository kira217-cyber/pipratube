import React, { useState } from "react";
import { ExternalLink, Flag, ShieldOff, X } from "lucide-react";

import { EmptyState, PageHeader, Spinner } from "../components/ui";
import { Badge, Btn, Pager } from "../components/kit";
import { apiError, send, SITE_URL } from "../api/client";
import { usePaged } from "../hooks/usePaged";
import { fullDate } from "../utils/format";
import { confirmDialog, toast } from "../utils/alerts";

const TABS = [
  ["open", "Open"],
  ["resolved", "Resolved"],
  ["dismissed", "Dismissed"],
];

// Videos viewers flagged from the ⋮ menu → Report. Take the video down
// (with the reason shown to its creator) or dismiss the report.
const Reports = () => {
  const [status, setStatus] = useState("open");
  const list = usePaged("/api/admin/reports", { status });

  const setReport = async (report, next) => {
    try {
      await send("patch", `/api/admin/reports/${report.id}`, { status: next });
      toast.success(next === "dismissed" ? "Report dismissed" : next === "open" ? "Report reopened" : "Marked as resolved");
      list.reload();
    } catch (error) {
      toast.error(apiError(error, "Couldn't update"));
    }
  };

  const takeDown = async (report) => {
    if (!(await confirmDialog(`Take down "${report.video.title}"?`, { text: `Reason shown to the creator: ${report.reasonLabel}`, confirmText: "Take down", danger: true }))) return;
    try {
      await send("patch", `/api/admin/videos/${report.video.id}`, { status: "removed", removedReason: `Removed after a report: ${report.reasonLabel}` });
      await send("patch", `/api/admin/reports/${report.id}`, { status: "resolved" });
      toast.success("Video taken down");
      list.reload();
    } catch (error) {
      toast.error(apiError(error, "Couldn't take it down"));
    }
  };

  return (
    <div>
      <PageHeader title="Reports" subtitle="Videos viewers flagged for review" />

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setStatus(key);
              list.setPage(1);
            }}
            className={`shrink-0 cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold transition ${status === key ? "bg-white text-black" : "bg-card-2 text-white hover:bg-white/10"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.loading ? (
        <Spinner />
      ) : list.items.length === 0 ? (
        <EmptyState icon={Flag} title={status === "open" ? "No open reports" : "Nothing here"} text={status === "open" ? "When viewers report a video it shows up here." : undefined} />
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line bg-card">
          {list.items.map((report) => (
            <div key={report.id} className="flex flex-wrap gap-3 p-3 sm:flex-nowrap">
              <div className="w-32 shrink-0 overflow-hidden rounded-lg bg-card-2 sm:w-40">
                {report.video?.thumbnail && <img src={report.video.thumbnail} alt="" className="aspect-video w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold">{report.video?.title || "Deleted video"}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {report.video?.channel?.name} · reported {fullDate(report.createdAt)} by {report.reporter ? `${report.reporter.name} (${report.reporter.contact})` : "a signed-out viewer"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge tone="red">{report.reasonLabel}</Badge>
                  {report.video?.status === "removed" && <Badge>Video is down</Badge>}
                </div>
                {report.details && <p className="mt-1.5 rounded-lg bg-card-2 px-2.5 py-1.5 text-sm text-slate-200">“{report.details}”</p>}
              </div>
              <div className="flex w-full shrink-0 flex-wrap gap-1.5 sm:w-auto sm:flex-col sm:items-stretch">
                {report.video && (
                  <a
                    href={`${SITE_URL}/watch/${report.video.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-white/10"
                  >
                    <ExternalLink className="h-4 w-4" /> Watch
                  </a>
                )}
                {status === "open" ? (
                  <>
                    {report.video && report.video.status !== "removed" && (
                      <Btn tone="danger" onClick={() => takeDown(report)}>
                        <ShieldOff className="h-4 w-4" /> Take down
                      </Btn>
                    )}
                    <Btn onClick={() => setReport(report, "dismissed")}>
                      <X className="h-4 w-4" /> Dismiss
                    </Btn>
                  </>
                ) : (
                  <Btn onClick={() => setReport(report, "open")}>Reopen</Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pager page={list.page} totalPages={list.totalPages} onPage={list.setPage} />
    </div>
  );
};

export default Reports;
