import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Bell, Heart } from "lucide-react";

import { Avatar, Spinner } from "../ui/ui";
import { notifications as fetchNotifications, readAll, unreadCount } from "../../api/engage";
import { useAuth } from "../../context/AuthContext";
import { timeAgo } from "../../utils/format";
import { openStudio } from "../../utils/handoff";

const POLL_MS = 60 * 1000;

const describe = (n) => {
  const who = n.actor?.name || "Someone";
  switch (n.type) {
    case "new_video":
      return `${n.channel?.name || who} uploaded: ${n.text}`;
    case "comment":
      return `${who} commented: "${n.text}"`;
    case "reply":
      return `${who} replied: "${n.text}"`;
    case "heart":
      return `${who} loved your comment: "${n.text}"`;
    case "subscriber":
      return `${who} subscribed to your channel`;
    default:
      return n.text;
  }
};

const linkFor = (n) => {
  if (n.video?.id) return `/watch/${n.video.id}`;
  if (n.channel?.handle) return `/@${n.channel.handle}`;
  return "/";
};

// Header bell: unread dot (checked every minute) and the latest list.
const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(null);
  const ref = useRef(null);

  const poll = useCallback(() => {
    unreadCount()
      .then((result) => setUnread(result.unread))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [user, poll]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => !ref.current?.contains(event.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const toggle = async () => {
    if (!user) {
      navigate("/login", { state: { from: window.location.pathname } });
      return;
    }
    const next = !open;
    setOpen(next);
    if (next) {
      setItems(null);
      try {
        const result = await fetchNotifications();
        setItems(result.notifications);
        if (result.unread) {
          await readAll();
          setUnread(0);
        }
      } catch {
        setItems([]);
      }
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={toggle}
        className="relative flex h-10 w-9 cursor-pointer items-center justify-center rounded-full text-white transition hover:bg-white/10 min-[380px]:w-10"
      >
        <Bell className="h-6 w-6" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-header bg-live px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-2 top-16 z-50 overflow-hidden rounded-2xl border border-line bg-card shadow-2xl shadow-black/60 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[26rem]">
          <p className="border-b border-line px-4 py-3 font-semibold text-white">Notifications</p>
          <div className="max-h-[70vh] overflow-y-auto">
            {items === null ? (
              <Spinner className="py-8" />
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <Bell className="h-10 w-10 text-muted" />
                <p className="mt-3 font-semibold">Your notifications live here</p>
                <p className="mt-1 text-sm text-muted">Subscribe to channels to hear about their new videos, and see comments and replies on yours.</p>
              </div>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  to={linkFor(n)}
                  onClick={(event) => {
                    setOpen(false);
                    // A new subscriber is news for Studio, not a page here.
                    if (n.type === "subscriber" && !n.video?.id) {
                      event.preventDefault();
                      openStudio("/");
                    }
                  }}
                  className={`flex gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-white/5 ${n.read ? "" : "bg-brand/5"}`}
                >
                  <span className="relative mt-0.5 shrink-0">
                    {!n.read && <span className="absolute -left-2.5 top-4 h-1.5 w-1.5 rounded-full bg-[#3ea6ff]" />}
                    <Avatar src={n.actor?.avatar || n.channel?.avatar} name={n.actor?.name || n.channel?.name} size="h-10 w-10" ring={false} />
                    {n.type === "heart" && <Heart className="absolute -bottom-1 -right-1 h-4 w-4 fill-live text-live" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-3 text-sm text-white">{describe(n)}</span>
                    <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.createdAt)}</span>
                  </span>
                  {n.video?.thumbnail && <img src={n.video.thumbnail} alt="" className="aspect-video w-24 shrink-0 rounded-md object-cover" />}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
