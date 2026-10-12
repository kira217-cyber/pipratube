import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Bookmark, Clock, Download, EllipsisVertical, Flag, ListPlus, MinusCircle, Share2, X } from "lucide-react";

import SaveDialog from "../SaveDialog/SaveDialog";
import ShareDialog from "../ShareDialog/ShareDialog";
import { api } from "../../api/axios";
import { apiError, studioApi, TOKEN_KEY } from "../../api/studioApi";
import { useRequireSignIn } from "../../hooks/useRequireSignIn";
import { addToQueue, hideChannel, hideVideo } from "../../utils/videoPrefs";
import { countShare, visitorId } from "../../utils/visitor";
import { toast } from "../../utils/alerts";

// The ⋮ menu on every video card, with YouTube's options. The list opens in
// a portal so rows that scroll sideways never clip it, and flips upward when
// there's no room below.

const MENU_WIDTH = 240;

const ReportDialog = ({ video, onClose }) => {
  const [reasons, setReasons] = useState(null);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/api/videos/report-reasons")
      .then(({ data }) => setReasons(data.data.reasons))
      .catch(() => setReasons([]));
  }, []);

  const send = async () => {
    setBusy(true);
    try {
      const client = localStorage.getItem(TOKEN_KEY) ? studioApi : api;
      const { data } = await client.post(`/api/videos/${video.id}/report`, { reason, details, visitorId: visitorId() });
      toast.success(data.message || "Thanks for reporting");
      onClose();
    } catch (error) {
      toast.error(apiError(error, "Couldn't send the report"));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} className="flex max-h-[90vh] w-full flex-col rounded-t-2xl border border-line bg-card sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <p className="text-lg font-bold">Report video</p>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-3">
          <p className="mb-2 line-clamp-1 text-sm text-muted">{video.title}</p>
          {reasons === null ? (
            <p className="py-6 text-center text-sm text-muted">Loading…</p>
          ) : (
            <div className="space-y-0.5">
              {reasons.map((item) => (
                <label key={item.key} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-white/5">
                  <input type="radio" name="report-reason" checked={reason === item.key} onChange={() => setReason(item.key)} className="h-4 w-4 accent-[#ff2d6f]" />
                  {item.label}
                </label>
              ))}
            </div>
          )}
          {reason && (
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Add details (optional)"
              className="mt-3 w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand/70"
            />
          )}
          <p className="mt-2 text-xs text-muted">Reports are reviewed by the PipraTube team. Misusing reports can limit your account.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-white/10">
            Cancel
          </button>
          <button type="button" disabled={!reason || busy} onClick={send} className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-40">
            {busy ? "Sending…" : "Report"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const VideoMenu = ({ video, className = "" }) => {
  const button = useRef(null);
  const menu = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const requireSignIn = useRequireSignIn();

  // Place the list beside the button, inside the screen, flipping up if needed.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const rect = button.current.getBoundingClientRect();
    const height = menu.current?.offsetHeight || 340;
    const below = rect.bottom + 6 + height <= window.innerHeight;
    setPosition({
      left: Math.max(8, Math.min(window.innerWidth - MENU_WIDTH - 8, rect.right - MENU_WIDTH)),
      top: below ? rect.bottom + 6 : Math.max(8, rect.top - height - 6),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onKey = (event) => event.key === "Escape" && close();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const link = `${window.location.origin}${video.isShort ? `/shorts?v=${video.id}` : `/watch/${video.id}`}`;
  const channelName = video.channel?.name || "this channel";

  const items = [
    { label: "Add to queue", icon: ListPlus, run: () => (addToQueue(video), toast.success("Added to queue")) },
    {
      label: "Save to Watch later",
      icon: Clock,
      run: async () => {
        if (!requireSignIn("Sign in to save videos")) return;
        try {
          await studioApi.post("/api/playlists/watch-later/videos", { video: video.id, add: true });
          toast.success("Saved to Watch later");
        } catch (error) {
          toast.error(apiError(error, "Couldn't save"));
        }
      },
    },
    { label: "Save to playlist", icon: Bookmark, run: () => requireSignIn("Sign in to save videos") && setSaving(true) },
    video.videoUrl && { label: "Download", icon: Download, href: video.videoUrl },
    {
      label: "Share",
      icon: Share2,
      run: () => setSharing(true),
    },
    "divider",
    { label: "Not interested", icon: Ban, run: () => hideVideo(video.id) },
    video.channel?.id && { label: "Don't recommend channel", icon: MinusCircle, run: () => hideChannel(video.channel.id) },
    { label: "Report", icon: Flag, run: () => setReporting(true) },
  ].filter(Boolean);

  const row = "flex w-full cursor-pointer items-center gap-4 px-4 py-2.5 text-left text-sm text-white hover:bg-white/10";

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`More actions for ${video.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/90 transition hover:bg-white/10 ${open ? "bg-white/10" : ""} ${className}`}
      >
        <EllipsisVertical className="h-5 w-5" />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)}>
            <div
              ref={menu}
              role="menu"
              onClick={(event) => event.stopPropagation()}
              className={`fixed w-60 overflow-hidden rounded-xl border border-white/10 bg-[#282828] py-2 shadow-2xl transition-opacity ${position ? "opacity-100" : "opacity-0"}`}
              style={{ left: position?.left ?? -9999, top: position?.top ?? 0, width: MENU_WIDTH }}
            >
              {items.map((item, index) =>
                item === "divider" ? (
                  <div key={`d${index}`} className="my-1.5 h-px bg-white/10" />
                ) : item.href ? (
                  <a key={item.label} role="menuitem" href={item.href} target="_blank" rel="noreferrer" download onClick={() => setOpen(false)} className={row}>
                    <item.icon className="h-5 w-5 shrink-0" /> {item.label}
                  </a>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      item.run();
                    }}
                    className={row}
                  >
                    <item.icon className="h-5 w-5 shrink-0" /> {item.label}
                    {item.label === "Don't recommend channel" && <span className="sr-only">{channelName}</span>}
                  </button>
                ),
              )}
            </div>
          </div>,
          document.body,
        )}

      {saving && createPortal(<SaveDialog videoId={video.id} onClose={() => setSaving(false)} />, document.body)}
      {reporting && <ReportDialog video={video} onClose={() => setReporting(false)} />}
      {sharing && <ShareDialog url={link} title={video.title} onClose={() => setSharing(false)} onShared={() => countShare(video.id)} />}
    </>
  );
};

export default VideoMenu;
