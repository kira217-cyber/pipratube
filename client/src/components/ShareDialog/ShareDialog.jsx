import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Facebook, Mail, MessageCircle, Send, Share2, X } from "lucide-react";

import { toast } from "../../utils/alerts";

// YouTube's share box: a row of apps (WhatsApp, Facebook, Messenger, X,
// Telegram, Email, and the phone's own share sheet when there is one) and
// the link with a Copy button. Works the same on every browser — the
// system share sheet alone silently does nothing on many of them.
//
// Each app gets the plain page link; the app then fetches the page's
// preview (thumbnail, title) itself — see server/routes/og.js.

const isTouch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

const XLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const ShareDialog = ({ url, title, onClose, onShared }) => {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const text = title ? `${title}\n${url}` : url;
  const enc = encodeURIComponent;
  const apps = [
    { name: "WhatsApp", href: `https://wa.me/?text=${enc(text)}`, icon: MessageCircle, bg: "bg-[#25d366]" },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, icon: Facebook, bg: "bg-[#1877f2]", iconClass: "fill-white" },
    isTouch() && { name: "Messenger", href: `fb-messenger://share/?link=${enc(url)}`, icon: MessageCircle, bg: "bg-gradient-to-br from-[#00b2ff] to-[#a033ff]" },
    { name: "X", href: `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title || "")}`, icon: XLogo, bg: "bg-black ring-1 ring-white/20" },
    { name: "Telegram", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(title || "")}`, icon: Send, bg: "bg-[#229ed9]" },
    { name: "Email", href: `mailto:?subject=${enc(title || "PipraTube")}&body=${enc(text)}`, icon: Mail, bg: "bg-[#5f6368]" },
  ].filter(Boolean);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older browsers: select the text and copy it the old way.
      inputRef.current?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    toast.success("Link copied");
    onShared?.();
    setTimeout(() => setCopied(false), 2000);
  };

  const systemShare = async () => {
    try {
      await navigator.share({ title, url });
      onShared?.();
      onClose();
    } catch {
      // Sheet closed — stay here.
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Share" className="w-full rounded-t-2xl bg-card p-5 shadow-2xl sm:max-w-[520px] sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Share</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 cursor-pointer rounded-full p-2 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="no-scrollbar -mx-1 mt-4 flex gap-3 overflow-x-auto px-1 pb-1">
          {apps.map(({ name, href, icon: Icon, bg, iconClass = "" }) => (
            <a
              key={name}
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              onClick={() => onShared?.()}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center"
            >
              <span className={`flex h-14 w-14 items-center justify-center rounded-full text-white transition hover:brightness-110 ${bg}`}>
                <Icon className={`h-6 w-6 ${iconClass}`} />
              </span>
              <span className="text-xs text-slate-200">{name}</span>
            </a>
          ))}
          {typeof navigator !== "undefined" && navigator.share && (
            <button type="button" onClick={systemShare} className="flex w-16 shrink-0 cursor-pointer flex-col items-center gap-1.5 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20">
                <Share2 className="h-6 w-6" />
              </span>
              <span className="text-xs text-slate-200">More</span>
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-black/30 p-1.5 pl-3">
          <input ref={inputRef} readOnly value={url} onFocus={(event) => event.target.select()} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none" />
          <button type="button" onClick={copy} className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-[#3ea6ff] px-4 py-2 text-sm font-semibold text-black hover:brightness-110">
            {copied && <Check className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ShareDialog;
