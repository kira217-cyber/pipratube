import React, { useEffect, useRef, useState } from "react";
import { isHls, playableSrc, useHlsSource } from "../../utils/hls";
import { Volume2, VolumeX } from "lucide-react";

// YouTube-style inline preview for a video poster.
//
//   • Desktop (a real pointer): hovering a poster for a moment plays the
//     video silently right there in the card.
//   • Phones/tablets (no hover): with `autoplayInView`, whichever card is
//     resting in the middle of the screen plays as you scroll the feed.
//
// Shorts (`clipSeconds` + `minimal`): like YouTube, hovering plays just the
// first few seconds on a silent loop, filling the card, with no controls.
//
// Only one preview plays at a time across the whole page — starting one
// stops the rest — and nothing is downloaded until a preview starts.

const START_DELAY_MS = 450;
const CENTER_DWELL_MS = 700;
const PREVIEW_EVENT = "pipra:preview-start";

const canHover = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

// Remembered for the visit, like YouTube's preview mute toggle.
let previewMuted = true;

const formatClock = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

const VideoPreview = ({ id, src, poster, alt, autoplayInView = false, eager = false, duration, clipSeconds, minimal = false, className = "", children }) => {
  const boxRef = useRef(null);
  const videoRef = useRef(null);
  const timer = useRef(null);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(previewMuted);
  const [time, setTime] = useState({ current: 0, total: 0 });

  const start = () => {
    if (!src) return;
    window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: id }));
    setActive(true);
  };

  const stop = () => {
    window.clearTimeout(timer.current);
    setActive(false);
    setReady(false);
  };

  // Another card started — this one steps aside.
  useEffect(() => {
    const onOther = (event) => {
      if (event.detail !== id) {
        window.clearTimeout(timer.current);
        setActive(false);
        setReady(false);
      }
    };
    window.addEventListener(PREVIEW_EVENT, onOther);
    return () => window.removeEventListener(PREVIEW_EVENT, onOther);
  }, [id]);

  // Touch devices: play the card resting in the middle band of the screen.
  useEffect(() => {
    if (!autoplayInView || canHover() || !src) return undefined;
    const el = boxRef.current;
    if (!el) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        window.clearTimeout(timer.current);
        if (entry.isIntersecting) {
          timer.current = window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: id }));
            setActive(true);
          }, CENTER_DWELL_MS);
        } else {
          setActive(false);
          setReady(false);
        }
      },
      // Only the middle ~third of the viewport counts as "in view".
      { rootMargin: "-38% 0px -38% 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer.current);
    };
  }, [autoplayInView, src, id]);

  useEffect(() => {
    const player = videoRef.current;
    if (!active || !player) return;
    player.muted = minimal ? true : previewMuted;
    // HLS starts by itself (autoPlay) once hls.js has attached it.
    if (isHls(src)) return;
    player.play().catch(() => {
      // Autoplay refused (e.g. data saver) — fall back to the poster.
      setActive(false);
    });
  }, [active, minimal, src]);

  useHlsSource(videoRef, src, { enabled: active });

  const hoverProps = canHover()
    ? {
        onMouseEnter: () => {
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(start, START_DELAY_MS);
        },
        onMouseLeave: stop,
      }
    : {};

  const toggleMute = (event) => {
    event.preventDefault();
    event.stopPropagation();
    previewMuted = !muted;
    setMuted(previewMuted);
    if (videoRef.current) videoRef.current.muted = previewMuted;
  };

  const remaining = time.total ? time.total - time.current : null;

  return (
    <div ref={boxRef} className={`relative overflow-hidden ${className}`} {...hoverProps}>
      {poster && (
        <img
          src={poster}
          alt={alt}
          // A failed poster gets one retry (the API may have been restarting);
          // after that the grey card shows instead of the alt text.
          onError={(event) => {
            const img = event.currentTarget;
            if (img.dataset.retried) {
              img.style.visibility = "hidden";
              return;
            }
            img.dataset.retried = "1";
            window.setTimeout(() => {
              img.src = `${poster}${poster.includes("?") ? "&" : "?"}retry=1`;
            }, 1500);
          }}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          className={`h-full w-full object-cover transition duration-300 ${ready ? "opacity-0" : "opacity-100"}`}
        />
      )}

      {active && (
        <video
          ref={videoRef}
          src={playableSrc(src)}
          autoPlay={isHls(src)}
          muted={minimal ? true : muted}
          playsInline
          preload="auto"
          loop={Boolean(clipSeconds)}
          onPlaying={() => setReady(true)}
          onTimeUpdate={(event) => {
            const player = event.currentTarget;
            // Shorts: back to the start after the first few seconds.
            if (clipSeconds && player.currentTime >= clipSeconds) player.currentTime = 0;
            setTime({ current: player.currentTime, total: player.duration });
          }}
          onEnded={clipSeconds ? undefined : stop}
          className={`absolute inset-0 h-full w-full bg-black ${minimal ? "object-cover" : "object-contain"} transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
        />
      )}

      {/* Duration badge, swapped for a countdown while previewing. */}
      {!minimal && (ready ? remaining !== null : Boolean(duration)) && (
        <span className="absolute bottom-2 right-2 z-10 rounded-md bg-black/80 px-1.5 py-0.5 text-xs font-semibold text-white">
          {ready ? formatClock(remaining) : duration}
        </span>
      )}

      {ready && !minimal && (
        <>
          <button
            type="button"
            aria-label={muted ? "Unmute preview" : "Mute preview"}
            onClick={toggleMute}
            className="absolute right-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <span className="absolute inset-x-0 bottom-0 z-10 h-[3px] bg-white/25">
            <span
              className="block h-full bg-live"
              style={{ width: time.total ? `${(time.current / time.total) * 100}%` : "0%" }}
            />
          </span>
        </>
      )}

      {children}
    </div>
  );
};

export default VideoPreview;
