import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { SkipForward, Volume2, VolumeX } from "lucide-react";

import { api } from "../../api/axios";
import { trackAction } from "../../hooks/presenceSocket";

// Both size and position are admin-draggable (resize + move handles in
// AdCampaignManager.jsx) and stored per-campaign as percentages of the
// frame — the exact same percentages the admin's own mockup preview
// uses, so what's dragged there is exactly what renders here, at any
// real player width. These are only a fallback for a campaign saved
// before resizing existed (no stored width/height yet). Kept in sync
// with IMAGE_AD_DEFAULT_SIZES in server/models/AdCampaign.js.
//
// bottomBanner is the one exception: it's always full frame width, so
// its horizontal position/size are pinned edge-to-edge below instead of
// using the stored/admin-dragged values.
const DEFAULT_SECTION_SIZE = {
  topLeft: { width: 20.83, height: 51.85 },
  topRight: { width: 18.75, height: 20.37 },
  bottomRight: { width: 18.75, height: 20.37 },
  bottomBanner: { width: 100, height: 12.96 },
};

// Shared ad-rotation engine mounted inside both VideoPlayer (mode="pause")
// and HlsPlayer (mode="mute") — controls the same <video> element they own
// via videoRef, so their own play/pause/mute state stays in sync through
// native video events instead of new prop plumbing.
//
// Exposes { pause, resume } via ref so a scroll-driven feed (Shorts) can
// silence/continue the ad's own <video> when it scrolls off/back into
// view — the ad's rotation state is untouched, so coming back mid-ad
// resumes it right where it left off, like a paused reel on Facebook.
//
// Timing is per-campaign (firstDelaySeconds/intervalSeconds live on each
// campaign, not a shared site-wide clock), so every campaign schedules
// itself independently. If two campaigns' timers fire while one is
// already showing, the other queues and shows immediately after — only
// one ad is ever on screen at once, but each keeps its own cadence.
const AdOverlay = forwardRef(({ videoRef, mode, campaigns, playbackStarted }, ref) => {
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [skipCountdown, setSkipCountdown] = useState(0);
  const [adMuted, setAdMuted] = useState(true);

  const adVideoRef = useRef(null);
  const activeRef = useRef(null);
  const showTimersRef = useRef(new Map());
  const queueRef = useRef([]);
  const hideTimerRef = useRef(null);
  const skipTimerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    pause: () => {
      adVideoRef.current?.pause();
    },
    resume: () => {
      adVideoRef.current?.play().catch(() => {});
    },
  }));

  const clearShowTimer = (id) => {
    const timer = showTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      showTimersRef.current.delete(id);
    }
  };

  const scheduleCampaign = (campaign, delaySeconds) => {
    clearShowTimer(campaign.id);
    const timer = setTimeout(
      () => attemptShow(campaign),
      Math.max(0, delaySeconds) * 1000,
    );
    showTimersRef.current.set(campaign.id, timer);
  };

  const showCampaign = (campaign) => {
    activeRef.current = campaign;
    setActiveCampaign(campaign);

    if (campaign.type === "video") {
      const video = videoRef.current;
      if (video) {
        if (mode === "pause") video.pause();
        else video.muted = true;
      }

      setAdMuted(false);
      const skipAfter = Math.max(0, Math.ceil(campaign.skipAfterSeconds ?? 5));
      setSkipCountdown(skipAfter);

      if (skipAfter > 0) {
        skipTimerRef.current = setInterval(() => {
          setSkipCountdown((previous) => {
            if (previous <= 1) {
              clearInterval(skipTimerRef.current);
              return 0;
            }
            return previous - 1;
          });
        }, 1000);
      }
    } else {
      hideTimerRef.current = setTimeout(
        endCurrentAd,
        Math.max(1, campaign.displayDurationSeconds ?? 10) * 1000,
      );
    }
  };

  const attemptShow = (campaign) => {
    if (activeRef.current) {
      if (!queueRef.current.some((item) => item.id === campaign.id)) {
        queueRef.current.push(campaign);
      }
      return;
    }

    showCampaign(campaign);
  };

  const endCurrentAd = () => {
    const finished = activeRef.current;

    clearTimeout(hideTimerRef.current);
    clearInterval(skipTimerRef.current);
    setSkipCountdown(0);
    setActiveCampaign(null);
    activeRef.current = null;

    const video = videoRef.current;
    if (video) {
      if (mode === "pause") video.play().catch(() => {});
      else video.muted = false;
    }

    if (finished) {
      scheduleCampaign(finished, finished.intervalSeconds ?? 120);
    }

    const next = queueRef.current.shift();
    if (next) showCampaign(next);
  };

  useEffect(() => {
    if (!playbackStarted || !campaigns || campaigns.length === 0) return undefined;

    const timers = showTimersRef.current;
    campaigns.forEach((campaign) => {
      scheduleCampaign(campaign, campaign.firstDelaySeconds ?? 30);
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      queueRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackStarted, campaigns]);

  useEffect(
    () => () => {
      clearTimeout(hideTimerRef.current);
      clearInterval(skipTimerRef.current);
      showTimersRef.current.forEach((timer) => clearTimeout(timer));
    },
    [],
  );

  // Ads start unmuted — most browsers block autoplay-with-sound without
  // prior interaction, so fall back to muted playback (updating the mute
  // icon to match) rather than leaving the ad stalled on a blocked play().
  useEffect(() => {
    if (!activeCampaign || activeCampaign.type !== "video") return undefined;

    const video = adVideoRef.current;
    if (!video) return undefined;

    const tryPlay = async () => {
      try {
        await video.play();
      } catch {
        video.muted = true;
        setAdMuted(true);
        video.play().catch(() => {});
      }
    };

    tryPlay();
  }, [activeCampaign]);

  if (!activeCampaign) return null;

    if (activeCampaign.type === "video") {
      return (
        <div className="absolute inset-0 z-30 bg-black">
          <video
            ref={adVideoRef}
            key={activeCampaign.id}
            src={activeCampaign.video?.url}
            autoPlay
            playsInline
            muted={adMuted}
            className="h-full w-full cursor-pointer object-contain"
            onClick={() => {
              if (activeCampaign.clickUrl) {
                trackAction("Clicked ad", activeCampaign.title);
                window.open(activeCampaign.clickUrl, "_blank", "noreferrer");
              }
            }}
            onEnded={endCurrentAd}
          />

          <span className="pointer-events-none absolute left-4 top-4 rounded bg-black/60 px-2 py-1 text-[11px] font-bold text-white">
            Ad
          </span>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const video = adVideoRef.current;
              if (!video) return;
              video.muted = !video.muted;
              setAdMuted(video.muted);
              trackAction(video.muted ? "Muted ad" : "Unmuted ad", activeCampaign.title);
            }}
            aria-label={adMuted ? "Unmute ad" : "Mute ad"}
            className="absolute bottom-4 left-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm transition hover:bg-black/85"
          >
            {adMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>

          {skipCountdown > 0 ? (
            <span className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-black/70 px-4 py-2 text-xs font-bold text-white backdrop-blur-sm">
              Skip in {skipCountdown}s
            </span>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                trackAction("Skipped ad", activeCampaign.title);
                endCurrentAd();
              }}
              className="absolute bottom-4 right-4 flex cursor-pointer items-center gap-1.5 rounded-full bg-black/70 px-4 py-2 text-xs font-bold text-white backdrop-blur-sm transition hover:bg-black/85"
            >
              Skip Ad
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      );
    }

    const sections = activeCampaign.imageSections || {};
    const base = api.defaults.baseURL;

    return (
      <>
        {Object.entries(DEFAULT_SECTION_SIZE).map(([key, defaultSize]) => {
          const section = sections[key];
          if (!section?.image) return null;

          const isBanner = key === "bottomBanner";
          const width = isBanner ? 100 : section.width || defaultSize.width;
          const height = section.height || defaultSize.height;

          return (
            <a
              key={key}
              href={section.url || undefined}
              target={section.url ? "_blank" : undefined}
              rel={section.url ? "noreferrer" : undefined}
              onClick={(event) => {
                if (!section.url) event.preventDefault();
                else trackAction("Clicked image ad", section.url);
              }}
              style={{
                left: isBanner ? 0 : `${section.positionX ?? 0}%`,
                top: `${section.positionY ?? 0}%`,
                width: `${width}%`,
                height: `${height}%`,
              }}
              className={`absolute z-30 overflow-hidden rounded-lg border border-white/20 shadow-lg shadow-black/40 ${
                section.url ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <img
                src={`${base}${section.image}`}
                alt="Advertisement"
                className="h-full w-full object-cover"
              />
            </a>
          );
        })}
      </>
    );
});

AdOverlay.displayName = "AdOverlay";

export default AdOverlay;
