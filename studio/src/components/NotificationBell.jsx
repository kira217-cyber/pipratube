import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, ShieldAlert, ShieldCheck } from "lucide-react";

import { studioApi } from "../api/studioApi";
import { SITE_URL } from "../api/axios";
import { Avatar } from "./ui/ui";

// Studio's bell: what happened on the creator's channel — reviews and
// strikes from the adult-content check first and foremost, then comments,
// replies and new subscribers. Checked every minute; opening it marks all
// as read.

const POLL_MS = 60 * 1000;
const MODERATION = ["video_review", "video_approved", "video_rejected", "account_blocked"];

const ago = (date) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(date)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

const describe = (n) => {
  const who = n.actor?.name || "Someone";
  switch (n.type) {
    case "comment":
      return `${who} commented: "${n.text}"`;
    case "reply":
      return `${who} replied: "${n.text}"`;
    case "heart":
      return `${who} loved your comment: "${n.text}"`;
    case "subscriber":
      return `${who} subscribed to your channel`;
    case "new_video":
      return `${n.channel?.name || who} uploaded: ${n.text}`;
    default:
      return n.text;
  }
};

const NotificationBell = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(null);
  const box = useRef(null);

  const refreshCount = useCallback(() => {
    studioApi
      .get("/api/notifications/unread-count")
      .then(({ data }) => setUnread(data.data.unread || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = window.setInterval(refreshCount, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => !box.current?.contains(event.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const toggle = async () => {
    if (open) return setOpen(false);
    setOpen(true);
    try {
      const { data } = await studioApi.get("/api/notifications");
      setItems(data.data.notifications || []);
      if (unread) {
        await studioApi.post("/api/notifications/read-all", {});
        setUnread(0);
      }
    } catch {
      setItems([]);
    }
    return undefined;
  };

  const go = (n) => {
    setOpen(false);
    // Review news opens Content; anything about a video opens it on the site.
    if (MODERATION.includes(n.type)) navigate("/videos");
    else if (n.video?.id) window.open(`${SITE_URL}/watch/${n.video.id}`, "_blank", "noopener");
  };

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={toggle} aria-label="Notifications" className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full hover:bg-white/10">
        <Bell className="h-6 w-6" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e3172f] px-1 text-[11px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-2 top-16 z-50 max-h-[75vh] overflow-y-auto rounded-2xl border border-line bg-card shadow-2xl shadow-black/60 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[400px]">
          <p className="border-b border-line px-4 py-3 font-semibold">Notifications</p>
          {items === null ? (
            <p className="px-4 py-6 text-center text-sm text-muted">Loading…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <Bell className="h-10 w-10 text-muted" />
              <p className="mt-3 font-semibold">Nothing new</p>
              <p className="mt-1 text-sm text-muted">Comments, new subscribers and updates about your uploads show up here.</p>
            </div>
          ) : (
            items.map((n) => {
              const mod = MODERATION.includes(n.type);
              const good = n.type === "video_approved";
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => go(n)}
                  className={`flex w-full cursor-pointer gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-white/5 ${
                    mod && !good ? "border-l-4 border-l-[#e3172f] bg-[#e3172f]/10" : n.read ? "" : "bg-brand/5"
                  }`}
                >
                  {mod ? (
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${good ? "bg-[#22c55e]/15 text-[#4ade80]" : "bg-[#e3172f]/20 text-[#ff6b81]"}`}>
                      {good ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
                    </span>
                  ) : (
                    <Avatar src={n.actor?.avatar || n.channel?.avatar} name={n.actor?.name || n.channel?.name} size="h-10 w-10" ring={false} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`line-clamp-3 text-sm ${mod && !good ? "font-semibold text-[#ffb3bd]" : "text-white"}`}>{describe(n)}</span>
                    <span className="mt-0.5 block text-xs text-muted">{ago(n.createdAt)}</span>
                  </span>
                  {n.video?.thumbnail && !mod && <img src={n.video.thumbnail} alt="" className="aspect-video w-20 shrink-0 rounded-md object-cover" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
