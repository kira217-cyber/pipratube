import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SITE_URL } from "../../api/axios";
import { Check, Copy, Share2, Volume2, VolumeX, X } from "lucide-react";

import { confirmDialog, toast } from "../../utils/alerts";

// Full-screen upload, the way the Instagram "Edits" export looks: the video
// plays inside a phone-like frame whose border fills with an orange → pink →
// purple line as the upload advances, then a "Choose where to share" screen.

const RADIUS = 30;
const STROKE = 7;

const formatCountdown = (seconds) => {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

// Size of an element in CSS pixels, kept up to date as it resizes.
const useSize = () => {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
};

// A rounded rectangle traced clockwise from the middle of the top edge, so
// the progress line starts at 12 o'clock like the original.
const framePath = (w, h) => {
  const s = STROKE / 2;
  const r = RADIUS;
  const [x0, y0, x1, y1] = [s, s, w - s, h - s];
  return [
    `M ${w / 2} ${y0}`,
    `H ${x1 - r} A ${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
    `V ${y1 - r} A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
    `H ${x0 + r} A ${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
    `V ${y0 + r} A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
    "Z",
  ].join(" ");
};

// Portrait clips get a phone-shaped frame; landscape ones a wide one.
const frameBox = (portrait) =>
  portrait ? "aspect-[9/16] h-[min(58dvh,560px)] max-w-[88vw]" : "aspect-video w-[min(92vw,720px)] max-h-[58dvh]";

const ProgressFrame = ({ src, portrait, percent }) => {
  const [ref, { width, height }] = useSize();
  const d = width && height ? framePath(width, height) : "";
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div ref={ref} className={`relative ${frameBox(portrait)}`}>
      <div className="absolute overflow-hidden bg-black" style={{ inset: STROKE + 7, borderRadius: RADIUS - 10 }}>
        <video src={src} autoPlay muted loop playsInline className="h-full w-full object-cover" />
      </div>
      {d && (
        <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true">
          <defs>
            <linearGradient id="upload-ring" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width} y2={height}>
              <stop offset="0" stopColor="#ff9a1f" />
              <stop offset="0.4" stopColor="#ff2d6f" />
              <stop offset="0.72" stopColor="#c026d3" />
              <stop offset="1" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
          <path d={d} fill="none" stroke="#2b323c" strokeWidth={STROKE} />
          <path
            d={d}
            pathLength="100"
            fill="none"
            stroke="url(#upload-ring)"
            strokeWidth={STROKE}
            strokeLinecap={pct > 0 && pct < 100 ? "round" : "butt"}
            strokeDasharray={`${pct} 100`}
            style={{ transition: "stroke-dasharray 120ms linear" }}
          />
        </svg>
      )}
    </div>
  );
};

// ---------- share targets ----------

const Brand = ({ children }) => (
  <svg viewBox="0 0 24 24" className="h-[42%] w-[42%]" fill="currentColor" fillRule="evenodd" aria-hidden="true">
    {children}
  </svg>
);
const InstagramMark = () => (
  <Brand>
    <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM22 7.8c-.1-1.6-.4-3-1.6-4.2S17.8 2.1 16.2 2C14.6 2 9.4 2 7.8 2c-1.6.1-3 .4-4.2 1.6S2.1 6.2 2 7.8C2 9.4 2 14.6 2 16.2c.1 1.6.4 3 1.6 4.2s2.6 1.5 4.2 1.6c1.6.1 6.8.1 8.4 0 1.6-.1 3-.4 4.2-1.6s1.5-2.6 1.6-4.2c.1-1.6.1-6.8 0-8.4z" />
  </Brand>
);
const FacebookMark = () => (
  <Brand>
    <path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" />
  </Brand>
);
const WhatsAppMark = () => (
  <Brand>
    <path d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-1 1.2-.4.2-.6.1a8.2 8.2 0 0 1-4.1-3.6c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1.1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.5 13.5 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.2-.3-.3-.6-.4zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zm8.4-18.2A11.8 11.8 0 0 0 1.8 17.9L.1 24l6.3-1.6a11.8 11.8 0 0 0 5.6 1.4A11.8 11.8 0 0 0 20.4 3.6z" />
  </Brand>
);
const MessengerMark = () => (
  <Brand>
    <path d="M12 0C5.2 0 0 5 0 11.7c0 3.5 1.4 6.5 3.8 8.6.2.2.3.4.3.7l.1 2.1c0 .7.7 1.1 1.3.8l2.4-1c.2-.1.4-.1.6 0 1.1.3 2.3.5 3.5.5 6.8 0 12-5 12-11.7S18.8 0 12 0zm7.2 8.9-3.5 5.6a1.8 1.8 0 0 1-2.6.5l-2.8-2.1a.7.7 0 0 0-.9 0l-3.8 2.9c-.5.4-1.2-.2-.8-.8l3.5-5.6a1.8 1.8 0 0 1 2.6-.5l2.8 2.1a.7.7 0 0 0 .9 0l3.8-2.9c.5-.4 1.2.2.8.8z" />
  </Brand>
);
const TelegramMark = () => (
  <Brand>
    <path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.5 2.9c.9-.3 1.7.2 1.4 1.4z" />
  </Brand>
);

const isPhone = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const popup = (url) => window.open(url, "_blank", "noopener,noreferrer,width=640,height=640");

// Tiles share the row evenly, so every target fits on one line on a phone.
const ShareTile = ({ label, className, onClick, children }) => (
  <button type="button" onClick={onClick} className="flex min-w-0 cursor-pointer flex-col items-center gap-1.5">
    <span className={`flex aspect-square w-full max-w-[76px] items-center justify-center rounded-[22%] text-white transition active:scale-95 [&>svg]:h-[42%] [&>svg]:w-[42%] ${className}`}>
      {children}
    </span>
    <span className="whitespace-nowrap text-[12px] font-medium text-white/90 sm:text-[13px]">{label}</span>
  </button>
);

const ShareScreen = ({ file, src, portrait, video, onDone }) => {
  const [muted, setMuted] = useState(true);
  const [copied, setCopied] = useState(false);
  const isShort = video.isShort;
  const link = `${SITE_URL}${isShort ? `/shorts?v=${video.id}` : `/watch/${video.id}`}`;
  const text = `${video.title} — watch on PipraTube`;
  const enc = encodeURIComponent;

  const canShareFile = (() => {
    try {
      return Boolean(file && navigator.canShare?.({ files: [file] }));
    } catch {
      return false;
    }
  })();
  const canShare = typeof navigator !== "undefined" && Boolean(navigator.share);

  const nativeShare = async (data) => {
    try {
      await navigator.share(data);
    } catch (error) {
      if (error?.name !== "AbortError") toast.error("Couldn't open sharing");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const input = document.createElement("textarea");
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    toast.success("Link copied");
    window.setTimeout(() => setCopied(false), 2000);
  };

  // Phones keep to five tiles like the original; Telegram, Messenger and the
  // rest are one tap away in the system share sheet behind "More".
  const compact = isPhone() && canShare;
  const targets = [
    // Instagram has no web share link — on phones the video file itself goes
    // to the share sheet, where Instagram (Reels / Stories) picks it up.
    canShareFile && {
      key: "instagram",
      label: "Instagram",
      className: "bg-[linear-gradient(45deg,#f9a825,#e1306c_45%,#833ab4)]",
      icon: <InstagramMark />,
      onClick: () => nativeShare({ files: [file], title: video.title, text: `${text}\n${link}` }),
    },
    { key: "facebook", label: "Facebook", className: "bg-[#1877f2]", icon: <FacebookMark />, onClick: () => popup(`https://www.facebook.com/sharer/sharer.php?u=${enc(link)}`) },
    { key: "whatsapp", label: "WhatsApp", className: "bg-[#25d366]", icon: <WhatsAppMark />, onClick: () => popup(`https://wa.me/?text=${enc(`${text}\n${link}`)}`) },
    isPhone() && !canShare && { key: "messenger", label: "Messenger", className: "bg-[linear-gradient(45deg,#0695ff,#a334fa_60%,#ff6968)]", icon: <MessengerMark />, onClick: () => (window.location.href = `fb-messenger://share/?link=${enc(link)}`) },
    !compact && { key: "telegram", label: "Telegram", className: "bg-[#229ed9]", icon: <TelegramMark />, onClick: () => popup(`https://t.me/share/url?url=${enc(link)}&text=${enc(text)}`) },
    { key: "copy", label: copied ? "Copied" : "Copy link", className: "bg-[#262c35]", icon: copied ? <Check /> : <Copy />, onClick: copy },
    canShare && { key: "more", label: "More", className: "bg-[#262c35]", icon: <Share2 />, onClick: () => nativeShare({ title: video.title, text, url: link }) },
  ].filter(Boolean);

  return (
    <div className="flex min-h-full flex-col items-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center">
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Choose where to share</h1>
      <p className="mt-2 max-w-sm text-sm text-white/80 sm:text-base">
        {video.status === "processing"
          ? `Uploaded! Your ${isShort ? "Short" : "video"} goes live on PipraTube in a few minutes, as soon as it's ready — My videos shows when. You can share the link now.`
          : `Your ${isShort ? "Short" : "video"} is live on PipraTube. Share it so more people can watch.`}
      </p>

      <div className={`relative mt-5 overflow-hidden rounded-[28px] bg-black ${portrait ? "aspect-[9/16] h-[min(48dvh,520px)] max-w-[80vw]" : "aspect-video w-[min(92vw,720px)] max-h-[50dvh]"}`}>
        <video src={src} autoPlay muted={muted} loop playsInline className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={() => setMuted((value) => !value)}
          aria-label={muted ? "Unmute" : "Mute"}
          className="absolute bottom-3 right-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>

      <div className="mt-6 grid w-full max-w-[34rem] auto-cols-fr grid-flow-col gap-2.5 sm:gap-3">
        {targets.map((t) => (
          <ShareTile key={t.key} label={t.label} className={t.className} onClick={t.onClick}>
            {t.icon}
          </ShareTile>
        ))}
      </div>

      <div className="mt-6 flex w-full max-w-sm gap-3">
        <a href={link} target="_blank" rel="noreferrer" className="flex-1 rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-semibold hover:bg-white/10">
          Watch {isShort ? "Short" : "video"}
        </a>
        <button type="button" onClick={onDone} className="bg-brand-gradient flex-1 cursor-pointer rounded-xl py-3 text-sm font-semibold">
          Done
        </button>
      </div>
    </div>
  );
};

// `upload` comes from useUploadProgress; `published` is the saved video once
// the server confirms, which swaps the progress view for the share screen.
const UploadFlow = ({ upload, file, portrait, published, onCancel, onDone, onRetry }) => {
  const src = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => src && URL.revokeObjectURL(src), [src]);

  if (!upload?.active && !published) return null;

  const { status, percent, remaining, error } = upload;
  const shown = published ? 100 : Number(percent || 0);

  const close = async () => {
    if (published) return onDone();
    if (status === "error") return onRetry();
    if (status === "cancelling") return undefined;
    if (await confirmDialog("Cancel this upload?", { text: "The video won't be published.", confirmText: "Cancel upload", danger: true })) onCancel();
    return undefined;
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#0b0f14] text-white">
      <div className="flex min-h-full flex-col">
        <div className="flex h-14 shrink-0 items-center px-3 pt-[env(safe-area-inset-top)]">
          <button type="button" onClick={close} aria-label="Close" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full hover:bg-white/10">
            <X className="h-7 w-7" strokeWidth={2.5} />
          </button>
        </div>

        {published ? (
          <ShareScreen file={file} src={src} portrait={portrait} video={published} onDone={onDone} />
        ) : (
          <div className="flex flex-1 flex-col items-center px-4 pb-10 text-center">
            {status === "error" ? (
              <>
                <p className="text-2xl font-bold text-[#ff6b81]">Upload failed</p>
                <p className="mt-2 max-w-sm text-sm text-white/80">{error || "Something went wrong."} Your details are still filled in — try again.</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold tabular-nums">{Math.round(shown)}%</p>
                <p className="mt-2 max-w-sm text-[15px] leading-snug text-white/85">
                  {status === "cancelling"
                    ? "Cancelling…"
                    : status === "done"
                      ? "Upload complete"
                      : "Please don't close the app. You can choose where to share your video next."}
                </p>
                <p className="mt-1.5 h-5 text-xs text-white/45">
                  {status === "uploading" && (remaining === null ? "Estimating time…" : remaining > 0 ? `About ${formatCountdown(remaining)} left` : "Finishing up…")}
                  {status === "done" && "Opening share options…"}
                </p>
              </>
            )}
            <div className="mt-8 flex flex-1 items-start justify-center">{src && <ProgressFrame src={src} portrait={portrait} percent={shown} />}</div>
            {status === "error" && (
              <button type="button" onClick={onRetry} className="bg-brand-gradient mt-6 cursor-pointer rounded-xl px-8 py-3 text-sm font-semibold">
                Back to details
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadFlow;
