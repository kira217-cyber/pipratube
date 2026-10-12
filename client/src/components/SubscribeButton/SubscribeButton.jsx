import React, { useEffect, useRef, useState } from "react";
import { Bell, BellOff, BellRing, ChevronDown, UserMinus } from "lucide-react";

import { setBell, subscribe, unsubscribe } from "../../api/engage";
import { apiError } from "../../api/studioApi";
import { useRequireSignIn } from "../../hooks/useRequireSignIn";
import { toast } from "../../utils/alerts";

// YouTube's subscribe control: "Subscribe", then "🔔 Subscribed ▾" with a
// menu for All notifications / None / Unsubscribe. `onCount` receives the
// channel's new subscriber count. Give it a `key` that changes with the
// channel so a different channel starts from its own state.
const SubscribeButton = ({ channelId, initial, onCount, size = "md", light = true }) => {
  const requireSignIn = useRequireSignIn();
  const [state, setState] = useState({ subscribed: Boolean(initial?.subscribed), notify: initial?.notify || "all" });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => !menuRef.current?.contains(event.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const run = async (task, optimistic) => {
    const previous = state;
    setState(optimistic);
    setBusy(true);
    try {
      const result = await task();
      if (typeof result?.subscriberCount === "number") onCount?.(result.subscriberCount);
    } catch (error) {
      setState(previous);
      toast.error(apiError(error, "Couldn't update subscription"));
    } finally {
      setBusy(false);
    }
  };

  const pad = size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-2 text-sm";

  if (!state.subscribed) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (!requireSignIn("Sign in to subscribe")) return;
          run(() => subscribe(channelId), { subscribed: true, notify: "all" });
        }}
        className={`shrink-0 cursor-pointer rounded-full font-semibold transition disabled:opacity-60 ${pad} ${
          light ? "bg-white text-black hover:bg-white/90" : "bg-live text-white hover:brightness-110"
        }`}
      >
        Subscribe
      </button>
    );
  }

  const BellIcon = state.notify === "all" ? BellRing : BellOff;

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex cursor-pointer items-center gap-1.5 rounded-full bg-card-2 font-semibold text-white transition hover:bg-white/15 ${pad}`}
      >
        <BellIcon className="h-4 w-4" /> Subscribed <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-2xl shadow-black/60">
          {[
            ["all", "All", Bell],
            ["none", "None", BellOff],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setOpen(false);
                run(() => setBell(channelId, value), { ...state, notify: value });
              }}
              className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5 ${state.notify === value ? "text-white" : "text-slate-300"}`}
            >
              <Icon className="h-5 w-5" /> {label}
              {state.notify === value && <span className="ml-auto h-2 w-2 rounded-full bg-brand" />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              run(() => unsubscribe(channelId), { subscribed: false, notify: "all" });
            }}
            className="flex w-full cursor-pointer items-center gap-3 border-t border-line px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5"
          >
            <UserMinus className="h-5 w-5" /> Unsubscribe
          </button>
        </div>
      )}
    </div>
  );
};

export default SubscribeButton;
