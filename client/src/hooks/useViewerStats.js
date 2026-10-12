import { useEffect, useState } from "react";

// Live-looking audience numbers for a channel or a video. There is no
// per-item analytics on the server, so both numbers are derived on the
// client from the item's id — which keeps them stable per channel/video
// (the same channel always looks about as popular) while still moving
// while you watch:
//
//   • "Online Today" drifts up AND down around its own base, like a real
//     concurrent-viewer count.
//   • "Views" only ever goes up. Its starting point is a function of
//     wall-clock time, so a reload days later is always higher than
//     before, and the highest value ever shown is remembered per id.

const VIEWS_STORAGE_PREFIX = "pipratv_views_";

// Fixed point in time the "views grow steadily" curve is measured from.
const VIEWS_ANCHOR_MS = Date.UTC(2026, 0, 1);

const ONLINE_TICK_MS = 4000;
const VIEWS_TICK_MIN_MS = 3000;
const VIEWS_TICK_MAX_MS = 8000;

// FNV-1a — small, fast, and gives very different seeds for ids that only
// differ by a character or two (Mongo ObjectIds share a long prefix).
const hashId = (value) => {
  const text = String(value ?? "pipra-tv");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

// mulberry32 — a seeded generator, so the same id always produces the
// same base numbers on every device and every reload.
const seededRandom = (seed) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const randomBetween = (min, max) => min + Math.random() * (max - min);

const readStoredViews = (id) => {
  try {
    const stored = Number(
      window.localStorage.getItem(`${VIEWS_STORAGE_PREFIX}${id}`),
    );
    return Number.isFinite(stored) ? stored : 0;
  } catch {
    return 0;
  }
};

const storeViews = (id, value) => {
  try {
    window.localStorage.setItem(`${VIEWS_STORAGE_PREFIX}${id}`, String(value));
  } catch {
    // Private browsing / storage disabled — the time-based curve alone
    // still keeps the number from going backwards across reloads.
  }
};

const buildProfile = (id) => {
  const random = seededRandom(hashId(id));

  const onlineBase = Math.round(1500 + random() * 8000);
  const viewsBase = Math.round(200000 + random() * 2800000);
  const viewsPerHour = Math.round(15 + random() * 165);

  const hoursElapsed = Math.max(0, (Date.now() - VIEWS_ANCHOR_MS) / 3600000);
  const viewsNow = viewsBase + Math.floor(hoursElapsed * viewsPerHour);

  return {
    onlineBase,
    onlineMin: Math.round(onlineBase * 0.75),
    onlineMax: Math.round(onlineBase * 1.3),
    viewsStart: Math.max(viewsNow, readStoredViews(id)),
  };
};

export const useViewerStats = (id) => {
  const [online, setOnline] = useState(0);
  const [views, setViews] = useState(0);
  const [profile, setProfile] = useState(null);

  // A new id starts from its own profile — reset while rendering, not in
  // the effect, so there's no extra render with the old numbers.
  if (id && profile?.id !== id) {
    const next = { id, ...buildProfile(id) };
    setProfile(next);
    setOnline(next.onlineBase);
    setViews(next.viewsStart);
  }

  useEffect(() => {
    if (!id || profile?.id !== id) return undefined;

    storeViews(id, profile.viewsStart);

    const onlineTimer = window.setInterval(() => {
      setOnline((current) => {
        const swing = Math.round(profile.onlineBase * randomBetween(0.005, 0.03));
        const next = current + (Math.random() < 0.5 ? -swing : swing);
        return Math.min(profile.onlineMax, Math.max(profile.onlineMin, next));
      });
    }, ONLINE_TICK_MS);

    let viewsTimer;

    const scheduleViewsTick = () => {
      viewsTimer = window.setTimeout(() => {
        setViews((current) => {
          const next = current + 1 + Math.floor(Math.random() * 4);
          storeViews(id, next);
          return next;
        });
        scheduleViewsTick();
      }, randomBetween(VIEWS_TICK_MIN_MS, VIEWS_TICK_MAX_MS));
    };

    scheduleViewsTick();

    return () => {
      window.clearInterval(onlineTimer);
      window.clearTimeout(viewsTimer);
    };
  }, [id, profile]);

  return { online, views };
};

// "6,000" — matches how a daily audience count reads.
export const formatOnline = (value) => Number(value || 0).toLocaleString("en-US");

// "1M", "1.4M", "850K" — a total view count is always shown compact.
export const formatViews = (value) => {
  const number = Number(value || 0);

  const compact = (divisor, suffix) => {
    const scaled = number / divisor;
    const rounded = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
    return `${rounded}${suffix}`;
  };

  if (number >= 1000000000) return compact(1000000000, "B");
  if (number >= 1000000) return compact(1000000, "M");
  if (number >= 1000) return compact(1000, "K");

  return String(number);
};

export default useViewerStats;
