import React from "react";
import { AlertTriangle, CheckCircle2, Clock, UploadCloud } from "lucide-react";

// Turns seconds into the clock the countdown reads as — 5:00, 4:59, ...
// and 1:02:30 once an upload is long enough to need hours.
const formatCountdown = (seconds) => {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};

// Reassurance that something is genuinely moving, and roughly how fast.
const formatSpeed = (bytesPerSecond) => {
  const mb = bytesPerSecond / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB/s` : `${Math.round(bytesPerSecond / 1024)} KB/s`;
};

const formatSize = (bytes) => {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
};

// Blocks the page for as long as an upload is running, so nobody navigates
// away mid-transfer, and shows exactly how much longer it has to go.
const UploadProgressModal = ({ upload, onClose, onCancel }) => {
  if (!upload?.active) return null;

  const { status, phase, percent, remaining, speed, fileName, fileSize, error } =
    upload;

  const isDone = status === "done";
  const isError = status === "error";
  const isCancelling = status === "cancelling";

  // "prepare" is the gap where the browser has finished sending but the
  // server has not started pushing to storage yet — naming it stops that
  // pause looking like the upload has stalled.
  const phaseLabel =
    phase === "store"
      ? "Publishing to storage"
      : phase === "prepare"
        ? "Preparing on server"
        : "Sending to server";

  const countdown =
    remaining === null
      ? "Estimating..."
      : remaining <= 0
        ? "Finishing up..."
        : formatCountdown(remaining);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-[#ff2d6f]/25 bg-[#24101a] p-7 shadow-2xl shadow-black/60 md:p-8">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              isError
                ? "bg-rose-500/15 text-rose-300"
                : isDone
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-[#ff2d6f]/15 text-pink-300"
            }`}
          >
            {isError ? (
              <AlertTriangle className="h-6 w-6" />
            ) : isDone ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : (
              <UploadCloud className="h-6 w-6 animate-pulse" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-white">
              {isError
                ? "Upload failed"
                : isDone
                  ? "Upload successful"
                  : isCancelling
                    ? "Cancelling upload"
                    : "Uploading video"}
            </h2>

            {fileName && (
              <p className="mt-0.5 truncate text-xs text-slate-400" title={fileName}>
                {fileName}
                {fileSize ? ` — ${formatSize(fileSize)}` : ""}
              </p>
            )}
          </div>
        </div>

        {isError ? (
          <>
            <p className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm leading-relaxed text-rose-200">
              {error || "Something went wrong while uploading."}
            </p>

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full cursor-pointer rounded-2xl border border-[#ff2d6f]/25 bg-[#ff2d6f]/10 px-5 py-3 text-sm font-black text-pink-200 transition hover:bg-[#ff2d6f]/20"
            >
              Close
            </button>
          </>
        ) : (
          <>
            {/* The countdown — the one number worth reading at a glance. */}
            <div className="mt-6 rounded-2xl border border-[#ff2d6f]/15 bg-black/30 px-5 py-5 text-center">
              <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                {isDone ? "Completed" : "Time remaining"}
              </p>

              <p
                className={`mt-1.5 font-black tabular-nums text-white ${
                  isDone || countdown.length > 8 ? "text-3xl" : "text-5xl"
                }`}
              >
                {isDone ? "Done" : countdown}
              </p>

              <p className="mt-1.5 text-xs font-semibold text-pink-300">
                {isDone ? "Uploaded" : phaseLabel}
                {!isDone && speed > 0 ? ` — ${formatSpeed(speed)}` : ""}
              </p>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-bold">
                <span className="text-slate-300">{isDone ? "Complete" : "Progress"}</span>
                <span className="tabular-nums text-white">{percent}%</span>
              </div>

              <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/50">
                <div
                  className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
                    isDone
                      ? "bg-emerald-400"
                      : "bg-gradient-to-r from-[#ff7aa5] via-[#ff2d6f] to-[#c026d3]"
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>

            <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">
              {isDone
                ? "Uploaded — it goes live as soon as processing finishes."
                : isCancelling
                  ? "Stopping the transfer and cleaning up..."
                  : "Keep this tab open. Closing it now cancels the upload."}
            </p>

            {onCancel && !isDone && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isCancelling}
                className="mt-4 w-full cursor-pointer rounded-2xl border border-rose-400/30 bg-rose-500/10 px-5 py-3 text-sm font-bold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCancelling ? "Cancelling..." : "Cancel upload"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UploadProgressModal;
