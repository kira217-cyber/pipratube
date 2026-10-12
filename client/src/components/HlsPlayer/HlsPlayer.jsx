import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";

import AdOverlay from "../AdOverlay/AdOverlay";
import { useAdCampaigns } from "../../hooks/useAdCampaigns";
import { useWatchPresence } from "../../hooks/useWatchPresence";
import { trackAction } from "../../hooks/presenceSocket";

// `onUnavailable` lets the page that owns the channel list know this
// stream is dead, so it can drop the channel instead of leaving it in the
// grid for the next viewer to click.
const HlsPlayer = ({ src, poster, title, adsTarget, onUnavailable }) => {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const hideTimer = useRef(null);
  // True only while muted because the browser blocked unmuted autoplay
  // (never for a deliberate mute via the mute button) — lets the
  // "unmute on first tap anywhere" rescue below know it's safe to
  // override the mute, without ever fighting a real user choice.
  const autoMutedRef = useRef(false);

  const [hasStarted, setHasStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState(false);

  const { campaigns } = useAdCampaigns(adsTarget);
  useWatchPresence("liveTv", adsTarget?.liveTv, title);

  // Kept in a ref so the attach effect below stays keyed on `src` alone
  // and doesn't re-attach every time the parent re-renders.
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  const reportUnavailable = (streamUrl) => {
    setError(true);
    onUnavailableRef.current?.(streamUrl);
  };

  // Attaches and autoplays as soon as the channel is opened — falls back to
  // muted playback if the browser blocks autoplay-with-sound.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    const attach = () => {
      setError(false);
      setBuffering(true);

      const tryPlay = async () => {
        try {
          await video.play();
        } catch {
          video.muted = true;
          setMuted(true);
          autoMutedRef.current = true;
          video.play().catch(() => {});
        }
      };

      if (Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data?.fatal) reportUnavailable(src);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          tryPlay();
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        video.addEventListener("loadedmetadata", tryPlay);
        video.addEventListener("error", () => reportUnavailable(src));
      } else {
        reportUnavailable(src);
      }
    };

    attach();

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      video.play();
      trackAction("Resumed Live TV", title);
    } else {
      video.pause();
      trackAction("Paused Live TV", title);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    autoMutedRef.current = false; // this is now a deliberate choice, not the autoplay fallback
    trackAction(video.muted ? "Muted Live TV" : "Unmuted Live TV", title);
  };

  const handleVolume = (e) => {
    const video = videoRef.current;
    if (!video) return;

    const value = Number(e.target.value);
    video.volume = value;
    video.muted = value === 0;
    setVolume(value);
    setMuted(value === 0);
    // Dragging the slider is a deliberate choice too, so the autoplay
    // rescue below must not override it either.
    autoMutedRef.current = false;
  };

  // Browsers block unmuted autoplay before the user has interacted with
  // the page at all, so a fresh visit (especially mobile landing straight
  // on Live TV) always starts muted — that's a hard browser policy, not
  // something playback code can skip. The best available fix: the very
  // first tap/keypress ANYWHERE on the page counts as user activation, so
  // grab that moment to unmute automatically instead of requiring the
  // viewer to specifically find and tap the mute icon.
  //
  // Listens for "click" (not "pointerdown") deliberately: if that first
  // interaction IS the mute button itself, its own onClick (toggleMute)
  // fires first — since click bubbles from the button up to window — and
  // already clears autoMutedRef, so this only ever fires as a no-op
  // rescue for taps elsewhere, never as a second toggle fighting the
  // button's own click.
  useEffect(() => {
    const unmuteOnFirstInteraction = () => {
      if (!autoMutedRef.current) return;
      const video = videoRef.current;
      if (video) {
        video.muted = false;
        setMuted(false);
      }
      autoMutedRef.current = false;
    };

    window.addEventListener("click", unmuteOnFirstInteraction);
    window.addEventListener("keydown", unmuteOnFirstInteraction);
    return () => {
      window.removeEventListener("click", unmuteOnFirstInteraction);
      window.removeEventListener("keydown", unmuteOnFirstInteraction);
    };
  }, []);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      trackAction("Entered fullscreen", title);
    } else {
      document.exitFullscreen?.();
      trackAction("Exited fullscreen", title);
    }
  };

  useEffect(() => {
    const onFsChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // AdOverlay mutes/unmutes this element directly during a video ad — pick
  // that up here instead of new prop plumbing back out of AdOverlay.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const onVolumeChange = () => {
      setMuted(video.muted);
      setVolume(video.volume);
    };
    video.addEventListener("volumechange", onVolumeChange);
    return () => video.removeEventListener("volumechange", onVolumeChange);
  }, []);

  const resetHideTimer = (stillPlaying = playing) => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    if (stillPlaying) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  };

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  return (
    <div
      ref={containerRef}
      onMouseMove={() => resetHideTimer()}
      className="group relative aspect-video w-full overflow-hidden rounded-sm border border-[#ff2d6f]/20 bg-black shadow-2xl shadow-black/40 sm:rounded-2xl"
    >
      <video
        ref={videoRef}
        poster={poster}
        className="h-full w-full cursor-pointer bg-black object-contain"
        onClick={togglePlay}
        playsInline
        onPlay={() => {
          setPlaying(true);
          setHasStarted(true);
          resetHideTimer(true);
        }}
        onPause={() => {
          setPlaying(false);
          setShowControls(true);
        }}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => setBuffering(false)}
      />

      <AdOverlay
        videoRef={videoRef}
        mode="mute"
        campaigns={campaigns}
        playbackStarted={hasStarted}
      />

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center">
          <p className="text-sm font-semibold text-slate-200">
            This channel is currently unavailable. Please try another channel.
          </p>
        </div>
      )}

      {!error && buffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-[#ff2d6f]" />
        </div>
      )}

      {!error && !buffering && !playing && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/25 transition hover:bg-black/35"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#ff7aa5] via-[#ff2d6f] to-[#b0103f] shadow-[0_0_50px_rgba(22,214,220,0.5)] transition group-hover:scale-110">
            <Play className="ml-1 h-9 w-9 text-white" fill="black" />
          </span>
        </button>
      )}

      {title && (!playing || showControls) && (
        <div className="pointer-events-none absolute left-0 top-0 flex w-full items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-5 py-4">
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
            LIVE
          </span>
          <p className="truncate text-sm font-bold text-white sm:text-base">
            {title}
          </p>
        </div>
      )}

      {!error && (
        <div
          className={`absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-3 pt-8 transition-opacity duration-300 ${
            showControls || !playing ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="cursor-pointer text-white transition hover:text-[#ff2d6f]"
            >
              {playing ? (
                <Pause className="h-6 w-6" fill="currentColor" />
              ) : (
                <Play className="h-6 w-6" fill="currentColor" />
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="cursor-pointer text-white transition hover:text-[#ff2d6f]"
              >
                {muted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={handleVolume}
                aria-label="Volume"
                className="hidden h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/25 accent-[#ff2d6f] sm:block"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="cursor-pointer text-white transition hover:text-[#ff2d6f]"
          >
            {fullscreen ? (
              <Minimize className="h-5 w-5" />
            ) : (
              <Maximize className="h-5 w-5" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default HlsPlayer;
