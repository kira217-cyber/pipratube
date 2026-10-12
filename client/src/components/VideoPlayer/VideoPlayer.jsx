import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RectangleHorizontal,
  Repeat,
  RotateCcw,
  RotateCw,
  Settings,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";

import AdOverlay from "../AdOverlay/AdOverlay";
import { useAdCampaigns } from "../../hooks/useAdCampaigns";
import { useWatchPresence } from "../../hooks/useWatchPresence";
import { playableSrc, useHlsSource } from "../../utils/hls";
import { trackAction } from "../../hooks/presenceSocket";

// YouTube-style player: a scrubbable progress bar that shows what's
// buffered and the time under the pointer, play / previous / next, a volume
// slider that opens on hover, the elapsed / total time, and on the right
// captions, a settings menu (speed, quality, loop), theater mode, picture in
// picture and fullscreen. Keyboard shortcuts match YouTube's.

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const PREFS_KEY = "pipra_player";
const AUTOPLAY_SECONDS = 8;

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

const readPrefs = () => {
  try {
    return { volume: 1, speed: 1, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return { volume: 1, speed: 1 };
  }
};
const savePrefs = (patch) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    // Storage blocked — the next video starts from the defaults.
  }
};

const qualityLabel = (height) => (height >= 2160 ? "2160p 4K" : height >= 1440 ? "1440p HD" : height >= 720 ? `${height}p HD` : height ? `${height}p` : "Auto");

const ControlButton = ({ label, onClick, disabled, children, className = "" }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition hover:bg-white/15 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${className}`}
  >
    {children}
  </button>
);

const PILL = "flex h-10 items-center rounded-full bg-black/45 backdrop-blur-md sm:h-11";

// White track with a round white knob, like YouTube's volume: drag or click
// anywhere on it; arrow keys work when it has focus.
const VolumeSlider = ({ value, onChange }) => {
  const track = useRef(null);
  const dragging = useRef(false);
  const fromEvent = (event) => {
    const rect = track.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      onPointerDown={(event) => {
        event.stopPropagation();
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        onChange(fromEvent(event));
      }}
      onPointerMove={(event) => dragging.current && onChange(fromEvent(event))}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowUp") onChange(value + 0.05);
        else if (event.key === "ArrowLeft" || event.key === "ArrowDown") onChange(value - 0.05);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
      // Closed until the volume pill is hovered (or focused), then it slides open.
      className="flex h-full w-0 cursor-pointer touch-none items-center overflow-hidden opacity-0 outline-none transition-all duration-200 group-hover/vol:mr-3 group-hover/vol:w-[72px] group-hover/vol:opacity-100 focus-visible:mr-3 focus-visible:w-[72px] focus-visible:opacity-100"
    >
      <div ref={track} className="relative mx-1.5 h-[3px] w-full rounded-full bg-white/35">
        <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${value * 100}%` }} />
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${value * 100}%` }} />
      </div>
    </div>
  );
};

// ---------- progress bar ----------
const ProgressBar = ({ videoRef, current, duration, buffered, onSeekStart, onSeekEnd }) => {
  const bar = useRef(null);
  const [hover, setHover] = useState(null); // 0–1 under the pointer
  const [drag, setDrag] = useState(null); // 0–1 while dragging

  const fraction = (event) => {
    const rect = bar.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  };
  const seekTo = (value) => {
    const video = videoRef.current;
    if (video && duration) video.currentTime = value * duration;
  };

  const played = drag ?? (duration ? current / duration : 0);
  const preview = drag ?? hover;
  const active = drag !== null || hover !== null;

  return (
    <div
      ref={bar}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(current)}
      aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`}
      onPointerMove={(event) => {
        const value = fraction(event);
        setHover(value);
        if (drag !== null) {
          setDrag(value);
          seekTo(value);
        }
      }}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const value = fraction(event);
        setDrag(value);
        seekTo(value);
        onSeekStart?.();
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        if (drag === null) return;
        setDrag(null);
        onSeekEnd?.();
      }}
      onPointerCancel={() => setDrag(null)}
      className="group/bar relative flex h-5 cursor-pointer touch-none items-center"
    >
      {preview !== null && duration > 0 && (
        <span
          className="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded-md bg-black/85 px-2 py-1 text-xs font-semibold tabular-nums text-white"
          style={{ left: `clamp(24px, ${preview * 100}%, calc(100% - 24px))` }}
        >
          {formatTime(preview * duration)}
        </span>
      )}
      <div className={`relative w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-150 ${active ? "h-[6px]" : "h-[3px]"}`}>
        <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${buffered * 100}%` }} />
        {hover !== null && drag === null && <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${hover * 100}%` }} />}
        <div className="absolute inset-y-0 left-0 bg-[#ff1f4b]" style={{ width: `${played * 100}%` }} />
      </div>
      <span
        className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff1f4b] shadow transition-transform duration-150 ${active ? "scale-100" : "scale-0 group-hover/bar:scale-100"}`}
        style={{ left: `${played * 100}%` }}
      />
    </div>
  );
};

// ---------- settings menu ----------
const SettingsMenu = ({ speed, onSpeed, quality, levels = [], level = -1, onLevel, loop, onLoop, onClose }) => {
  const [page, setPage] = useState("main");
  const row = "flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-white/10";

  return (
    <div
      className="absolute bottom-2 right-2 z-30 max-h-[calc(100%-1rem)] w-64 max-w-[calc(100%-1rem)] overflow-y-auto rounded-xl border border-white/10 bg-[#1c1f26]/95 py-2 shadow-2xl backdrop-blur sm:bottom-16 sm:right-3 sm:max-h-[calc(100%-5rem)] sm:max-w-[calc(100%-1.5rem)]"
      onClick={(event) => event.stopPropagation()}
    >
      {page === "main" && (
        <>
          <button type="button" className={row} onClick={() => setPage("speed")}>
            <Gauge className="h-5 w-5" /> <span className="flex-1">Playback speed</span>
            <span className="text-white/70">{speed === 1 ? "Normal" : `${speed}x`}</span> <ChevronRight className="h-4 w-4 text-white/60" />
          </button>
          <button type="button" className={row} onClick={() => setPage("quality")}>
            <SlidersHorizontal className="h-5 w-5" /> <span className="flex-1">Quality</span>
            <span className="text-white/70">{levels.length > 1 && level === -1 ? `Auto (${qualityLabel(quality)})` : qualityLabel(quality)}</span> <ChevronRight className="h-4 w-4 text-white/60" />
          </button>
          <button type="button" className={row} onClick={() => onLoop(!loop)}>
            <Repeat className="h-5 w-5" /> <span className="flex-1">Loop</span>
            <span className={`relative h-5 w-9 rounded-full transition ${loop ? "bg-[#ff1f4b]" : "bg-white/25"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${loop ? "left-[18px]" : "left-0.5"}`} />
            </span>
          </button>
        </>
      )}

      {page !== "main" && (
        <button type="button" className={`${row} border-b border-white/10 font-semibold`} onClick={() => setPage("main")}>
          <ChevronLeft className="h-5 w-5" /> {page === "speed" ? "Playback speed" : "Quality"}
        </button>
      )}

      {page === "speed" &&
        SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            className={row}
            onClick={() => {
              onSpeed(value);
              onClose();
            }}
          >
            <span className="w-5">{speed === value && <Check className="h-4 w-4" />}</span>
            {value === 1 ? "Normal" : `${value}x`}
          </button>
        ))}

      {page === "quality" && levels.length > 1 && (
        <>
          {[...levels.map((height, index) => ({ index, height })).sort((a, b) => b.height - a.height), { index: -1, height: 0 }].map(({ index, height }) => (
            <button
              key={index}
              type="button"
              className={row}
              onClick={() => {
                onLevel(index);
                onClose();
              }}
            >
              <span className="w-5">{level === index && <Check className="h-4 w-4" />}</span>
              {index === -1 ? `Auto${level === -1 && quality ? ` (${qualityLabel(quality)})` : ""}` : qualityLabel(height)}
            </button>
          ))}
        </>
      )}

      {page === "quality" && levels.length <= 1 && (
        <>
          <div className={`${row} cursor-default hover:bg-transparent`}>
            <span className="w-5">
              <Check className="h-4 w-4" />
            </span>
            {qualityLabel(quality)}
          </div>
          <p className="px-4 pb-1 pt-1 text-xs leading-snug text-white/50">This video is available in one quality. More options appear once videos are encoded in several sizes.</p>
        </>
      )}
    </div>
  );
};

// ---------- the player ----------
const VideoPlayer = ({ src, poster, title, adsTarget, onStart, onNext, nextVideo, theater = false, onTheaterChange }) => {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const hideTimer = useRef(null);
  const clickTimer = useRef(null);
  const flashTimer = useRef(null);
  const countdownTimer = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(() => readPrefs().volume);
  const [speed, setSpeed] = useState(() => readPrefs().speed);
  const [loop, setLoop] = useState(false);
  const [quality, setQuality] = useState(0);
  // HLS videos (Bunny Stream) come in several sizes: heights by level, and
  // the chosen level (-1 = Auto, picked from the connection speed).
  const hlsRef = useRef(null);
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(-1);
  useHlsSource(videoRef, src, {
    onReady: (hls) => {
      hlsRef.current = hls;
      setLevels([]);
      setLevel(-1);
      if (!hls) return;
      hls.on("hlsManifestParsed", (_, data) => setLevels(data.levels.map((l) => l.height || 0)));
      hls.on("hlsLevelSwitched", (_, data) => setQuality(hls.levels[data.level]?.height || 0));
    },
  });
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [menu, setMenu] = useState(false);
  const [flash, setFlash] = useState(null); // { key, text, side }
  const [countdown, setCountdown] = useState(null); // seconds until the next video

  const { campaigns } = useAdCampaigns(adsTarget);
  useWatchPresence("video", adsTarget?.video, title);

  // Autoplay — browsers block sound without a click first, so fall back to
  // muted playback instead of a stalled player.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const prefs = readPrefs();
    video.volume = prefs.volume;
    video.playbackRate = prefs.speed;
    video.play().catch(() => {
      video.muted = true;
      setMuted(true);
      video.play().catch(() => {});
    });
  }, [src]);

  // Fires once per source when playback actually begins (view counting).
  const onStartRef = useRef(onStart);
  useEffect(() => {
    onStartRef.current = onStart;
  });
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    let fired = false;
    const handle = () => {
      if (fired) return;
      fired = true;
      onStartRef.current?.();
    };
    video.addEventListener("playing", handle);
    return () => video.removeEventListener("playing", handle);
  }, [src]);

  const showFlash = useCallback((text, side = "center") => {
    clearTimeout(flashTimer.current);
    setFlash({ key: Date.now(), text, side });
    flashTimer.current = setTimeout(() => setFlash(null), 650);
  }, []);

  const revealControls = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 3000);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      video.play().catch(() => {});
      trackAction("Played video", title);
    } else {
      video.pause();
      trackAction("Paused video", title);
    }
  }, [title]);

  const seekBy = useCallback(
    (delta) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.min(Math.max(video.currentTime + delta, 0), video.duration || 0);
      showFlash(`${delta > 0 ? "+" : "−"}${Math.abs(delta)}s`, delta > 0 ? "right" : "left");
      revealControls();
    },
    [showFlash, revealControls],
  );

  const changeVolume = useCallback(
    (value) => {
      const video = videoRef.current;
      if (!video) return;
      const next = Math.min(1, Math.max(0, value));
      video.volume = next;
      video.muted = next === 0;
      setVolume(next);
      setMuted(next === 0);
      savePrefs({ volume: next });
    },
    [],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) changeVolume(0.5);
    setMuted(video.muted);
    trackAction(video.muted ? "Muted video" : "Unmuted video", title);
  }, [changeVolume, title]);

  const changeSpeed = useCallback(
    (value) => {
      const video = videoRef.current;
      if (video) video.playbackRate = value;
      setSpeed(value);
      savePrefs({ speed: value });
      showFlash(`${value}x`);
    },
    [showFlash],
  );

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
      trackAction("Entered fullscreen", title);
    } else {
      document.exitFullscreen?.();
    }
  }, [title]);

  const togglePip = async () => {
    const video = videoRef.current;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video?.requestPictureInPicture();
    } catch {
      // Not supported here.
    }
  };

  const goPrevious = () => {
    const video = videoRef.current;
    if (video && video.currentTime > 3) video.currentTime = 0;
    else if (window.history.length > 1) window.history.back();
    else if (video) video.currentTime = 0;
  };

  useEffect(() => {
    const onFsChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(hideTimer.current);
      clearTimeout(clickTimer.current);
      clearTimeout(flashTimer.current);
      clearInterval(countdownTimer.current);
    },
    [],
  );

  // "Up next" countdown once the video ends (YouTube's autoplay).
  const cancelAutoplay = () => {
    clearInterval(countdownTimer.current);
    setCountdown(null);
  };
  const startAutoplay = () => {
    if (!onNext || loop) return;
    setCountdown(AUTOPLAY_SECONDS);
    clearInterval(countdownTimer.current);
    countdownTimer.current = setInterval(() => {
      setCountdown((value) => {
        if (value === null) return null;
        if (value <= 1) {
          clearInterval(countdownTimer.current);
          onNext();
          return null;
        }
        return value - 1;
      });
    }, 1000);
  };

  // Keyboard shortcuts (anywhere on the page, except while typing).
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.("input, textarea, select, [contenteditable=true]") || event.ctrlKey || event.metaKey || event.altKey) return;
      const video = videoRef.current;
      if (!video) return;
      const key = event.key;
      if (key === " " || key === "k" || key === "K") togglePlay();
      else if (key === "j" || key === "J") seekBy(-10);
      else if (key === "l" || key === "L") seekBy(10);
      else if (key === "ArrowLeft") seekBy(-5);
      else if (key === "ArrowRight") seekBy(5);
      else if (key === "ArrowUp") {
        changeVolume(video.volume + 0.05);
        showFlash(`${Math.round(Math.min(1, video.volume + 0.05) * 100)}%`);
      } else if (key === "ArrowDown") {
        changeVolume(video.volume - 0.05);
        showFlash(`${Math.round(Math.max(0, video.volume - 0.05) * 100)}%`);
      } else if (key === "m" || key === "M") toggleMute();
      else if (key === "f" || key === "F") toggleFullscreen();
      else if ((key === "t" || key === "T") && onTheaterChange) onTheaterChange(!theater);
      else if ((key === "N" && event.shiftKey) || key === "n") onNext?.();
      else if (key === ">" ) changeSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(video.playbackRate) + 1)] || 1);
      else if (key === "<") changeSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(video.playbackRate) - 1)] || 1);
      else if (/^[0-9]$/.test(key) && video.duration) video.currentTime = (Number(key) / 10) * video.duration;
      else return;
      event.preventDefault();
      revealControls();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, changeVolume, toggleMute, toggleFullscreen, changeSpeed, showFlash, revealControls, onNext, onTheaterChange, theater]);

  // Click: play/pause; double-click: fullscreen. Touch: tap shows the
  // controls, double-tap on the left/right third skips 10 seconds.
  const lastTap = useRef(0);
  const onSurfacePointerUp = (event) => {
    if (menu) {
      setMenu(false);
      return;
    }
    if (event.pointerType === "touch") {
      const now = Date.now();
      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      if (now - lastTap.current < 300) {
        clearTimeout(clickTimer.current);
        if (x < 0.35) seekBy(-10);
        else if (x > 0.65) seekBy(10);
        else togglePlay();
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;
      clickTimer.current = setTimeout(() => {
        if (showControls && playing) setShowControls(false);
        else revealControls();
      }, 300);
      return;
    }
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      toggleFullscreen();
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      togglePlay();
    }, 220);
  };

  const controlsVisible = showControls || !playing || menu;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      onMouseMove={revealControls}
      onMouseLeave={() => playing && !menu && setShowControls(false)}
      className={`group relative w-full select-none overflow-hidden bg-black ${
        fullscreen ? "h-full" : theater ? "aspect-video max-h-[calc(100vh-11rem)]" : "aspect-video rounded-sm shadow-2xl shadow-black/40 sm:rounded-2xl"
      } ${controlsVisible ? "" : "cursor-none"}`}
    >
      <video
        ref={videoRef}
        src={playableSrc(src)}
        poster={poster}
        playsInline
        preload="metadata"
        loop={loop}
        className="h-full w-full bg-black object-contain"
        onPlay={() => {
          setPlaying(true);
          setHasStarted(true);
          cancelAutoplay();
          revealControls();
        }}
        onPause={() => {
          setPlaying(false);
          setShowControls(true);
        }}
        onEnded={() => {
          setPlaying(false);
          setShowControls(true);
          startAutoplay();
        }}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => setBuffering(false)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        // Show the new time straight away while a far-off seek is still loading.
        onSeeking={(event) => setCurrent(event.currentTarget.currentTime)}
        onProgress={(event) => {
          const video = event.currentTarget;
          const ranges = video.buffered;
          for (let i = 0; i < ranges.length; i += 1) {
            if (ranges.start(i) <= video.currentTime + 0.5) setBuffered(video.duration ? ranges.end(i) / video.duration : 0);
          }
        }}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          setQuality(event.currentTarget.videoHeight);
        }}
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
      />

      {/* Click / tap surface (sits under the controls). */}
      <div className="absolute inset-0" onPointerUp={onSurfacePointerUp} />

      <AdOverlay videoRef={videoRef} mode="pause" campaigns={campaigns} playbackStarted={hasStarted} />

      {buffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-white/20 border-t-[#ff1f4b]" />
        </div>
      )}

      {!playing && !buffering && countdown === null && (
        <button
          type="button"
          aria-label="Play"
          onClick={togglePlay}
          className="absolute left-1/2 top-1/2 hidden h-20 w-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-[#ff1f4b]/90 sm:flex shadow-[0_0_40px_rgba(255,31,75,0.45)] transition hover:scale-110"
        >
          <Play className="ml-1 h-9 w-9 fill-white text-white" />
        </button>
      )}

      {/* Short-lived feedback: ±10s, 1.5x, 60%… */}
      {flash && (
        <div
          key={flash.key}
          className={`pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center justify-center ${
            flash.side === "left" ? "left-[12%]" : flash.side === "right" ? "right-[12%]" : "left-1/2 -translate-x-1/2"
          }`}
        >
          <span className="animate-[ping_0.65s_ease-out_1] absolute h-20 w-20 rounded-full bg-white/20" />
          <span className="relative rounded-full bg-black/60 px-4 py-2 text-base font-bold text-white">{flash.text}</span>
        </div>
      )}

      {/* Up next — counts down after the video ends. */}
      {countdown !== null && nextVideo && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
          <p className="text-sm text-white/70">Up next in {countdown}</p>
          <div className="flex max-w-md items-center gap-3 text-left">
            {nextVideo.thumbnail && <img src={nextVideo.thumbnail} alt="" className="aspect-video w-32 shrink-0 rounded-lg object-cover sm:w-44" />}
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold text-white sm:text-base">{nextVideo.title}</p>
              <p className="mt-1 truncate text-xs text-white/60">{nextVideo.channel?.name}</p>
            </div>
          </div>
          <div className="mt-1 flex gap-3">
            <button type="button" onClick={cancelAutoplay} className="cursor-pointer rounded-full bg-white/15 px-5 py-2 text-sm font-semibold text-white hover:bg-white/25">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                cancelAutoplay();
                onNext();
              }}
              className="cursor-pointer rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Play now
            </button>
          </div>
        </div>
      )}

      {title && controlsVisible && (
        <div className="pointer-events-none absolute inset-x-0 top-0 hidden bg-gradient-to-b from-black/75 to-transparent px-4 pb-8 pt-3 sm:block sm:px-5">
          <p className="truncate text-sm font-semibold text-white sm:text-base">{title}</p>
        </div>
      )}

      {/* Phones (YouTube app style): settings top-right, and back 10s /
          play-pause / forward 10s in the middle, so the small player
          keeps the picture clear. */}
      {countdown === null && (
        <div
          className={`absolute inset-0 z-10 transition-opacity duration-200 sm:hidden ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onPointerUp={(event) => event.target === event.currentTarget && onSurfacePointerUp(event)}
        >
          <div className="pointer-events-none absolute inset-0 bg-black/35" />
          <div className="absolute right-1 top-1">
            <ControlButton
              label="Settings"
              onClick={(event) => {
                event.stopPropagation();
                setMenu((value) => !value);
              }}
            >
              <span className="relative">
                <Settings className={`h-5 w-5 transition-transform duration-300 ${menu ? "rotate-45" : ""}`} />
                {speed !== 1 && <span className="absolute -right-2.5 -top-2 rounded bg-[#ff1f4b] px-0.5 text-[8px] font-bold leading-3">{speed}x</span>}
              </span>
            </ControlButton>
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-10">
            <button type="button" aria-label="Back 10 seconds" onClick={() => seekBy(-10)} className="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white">
              <RotateCcw className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              className={`pointer-events-auto flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white ${buffering && hasStarted ? "invisible" : ""}`}
            >
              {playing ? <Pause className="h-7 w-7 fill-white" /> : <Play className="ml-1 h-7 w-7 fill-white" />}
            </button>
            <button type="button" aria-label="Forward 10 seconds" onClick={() => seekBy(10)} className="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white">
              <RotateCw className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {menu && (
        <SettingsMenu
          speed={speed}
          onSpeed={changeSpeed}
          quality={quality}
          levels={levels}
          level={level}
          onLevel={(index) => {
            if (hlsRef.current) hlsRef.current.currentLevel = index;
            setLevel(index);
          }}
          loop={loop}
          onLoop={setLoop}
          onClose={() => setMenu(false)}
        />
      )}

      {/* Controls */}
      <div
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-col px-2 pb-0.5 transition-opacity duration-200 sm:bg-gradient-to-t sm:from-black/85 sm:via-black/45 sm:to-transparent sm:px-3 sm:pb-1.5 sm:pt-10 ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="order-2 px-1 sm:order-1">
          <ProgressBar videoRef={videoRef} current={current} duration={duration} buffered={buffered} onSeekStart={revealControls} />
        </div>

        {/* YouTube's newer look: each group of controls sits in its own
            translucent pill. */}
        <div className="order-1 flex items-center gap-1 sm:hidden">
          <span className="whitespace-nowrap px-2 text-xs font-semibold tabular-nums text-white">
            {formatTime(current)} <span className="text-white/70">/ {formatTime(duration)}</span>
          </span>
          <ControlButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute} className="ml-auto">
            <VolumeIcon className="h-5 w-5" />
          </ControlButton>
          <ControlButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </ControlButton>
        </div>

        <div className="order-2 mt-1 hidden items-center gap-1.5 sm:flex sm:gap-2">
          <div className={PILL}>
            <ControlButton label={playing ? "Pause (k)" : "Play (k)"} onClick={togglePlay}>
              {playing ? <Pause className="h-[22px] w-[22px] fill-white" /> : <Play className="ml-0.5 h-[22px] w-[22px] fill-white" />}
            </ControlButton>
          </div>

          <div className={PILL}>
            <ControlButton label="Previous" onClick={goPrevious} className="hidden sm:flex">
              <SkipBack className="h-5 w-5 fill-white" />
            </ControlButton>
            <ControlButton label="Back 10 seconds (j)" onClick={() => seekBy(-10)} className="sm:hidden">
              <RotateCcw className="h-5 w-5" />
            </ControlButton>
            <ControlButton label="Forward 10 seconds (l)" onClick={() => seekBy(10)} className="sm:hidden">
              <RotateCw className="h-5 w-5" />
            </ControlButton>
            <ControlButton label="Next (Shift+N)" onClick={onNext} disabled={!onNext}>
              <SkipForward className="h-5 w-5 fill-white" />
            </ControlButton>
          </div>

          {/* Volume: speaker + a white slider that opens on hover. */}
          <div className={`${PILL} group/vol hidden sm:flex`}>
            <ControlButton label={muted ? "Unmute (m)" : "Mute (m)"} onClick={toggleMute}>
              <VolumeIcon className="h-5 w-5" />
            </ControlButton>
            <VolumeSlider value={muted ? 0 : volume} onChange={changeVolume} />
          </div>
          <div className={`${PILL} sm:hidden`}>
            <ControlButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
              <VolumeIcon className="h-5 w-5" />
            </ControlButton>
          </div>

          <div className={`${PILL} px-3 sm:px-3.5`}>
            <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-white sm:text-[13px]">
              {formatTime(current)} <span className="text-white/70">/ {formatTime(duration)}</span>
            </span>
          </div>

          <div className={`${PILL} ml-auto`}>
            <ControlButton label="Subtitles aren't available" disabled className="hidden sm:flex">
              <Captions className="h-5 w-5" />
            </ControlButton>
            <ControlButton
              label="Settings"
              onClick={(event) => {
                event.stopPropagation();
                setMenu((value) => !value);
              }}
              className={menu ? "bg-white/15" : ""}
            >
              <span className="relative">
                <Settings className={`h-5 w-5 transition-transform duration-300 ${menu ? "rotate-45" : ""}`} />
                {speed !== 1 && <span className="absolute -right-2.5 -top-2 rounded bg-[#ff1f4b] px-0.5 text-[8px] font-bold leading-3">{speed}x</span>}
                {speed === 1 && quality >= 720 && <span className="absolute -right-2 -top-1.5 rounded bg-[#ff1f4b] px-0.5 text-[8px] font-bold leading-3">HD</span>}
              </span>
            </ControlButton>
            <ControlButton label="Picture in picture" onClick={togglePip} className="hidden md:flex">
              <PictureInPicture2 className="h-5 w-5" />
            </ControlButton>
            {onTheaterChange && !fullscreen && (
              <ControlButton label={theater ? "Default view (t)" : "Theater mode (t)"} onClick={() => onTheaterChange(!theater)} className="hidden lg:flex">
                <RectangleHorizontal className={`h-5 w-5 ${theater ? "scale-x-75" : ""}`} />
              </ControlButton>
            )}
            <ControlButton label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
