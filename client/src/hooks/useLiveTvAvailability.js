import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";

// Admins add Live TV channels from a large public source list and have no
// way of knowing which of those streams are actually up — a dead one only
// shows itself as "This channel is currently unavailable" once a viewer
// has already clicked it. So the client checks each channel's stream the
// same way HlsPlayer does (load the manifest, wait for it to parse or
// fatally error) and the page hides the ones that fail, instead of
// leaving the viewer to find them one by one.

const CACHE_KEY = "pipratv_livetv_availability";

// A channel that was down a moment ago may well be back later, so a
// verdict is only trusted for a short while before it's checked again.
const CACHE_TTL_MS = 15 * 60 * 1000;

// Long enough for a slow-but-working BDIX stream to answer, short enough
// that a dead one doesn't hold a slot in the queue.
const PROBE_TIMEOUT_MS = 7000;

// Probes run a few at a time — a page holds up to 48 channels and firing
// all of them at once would compete with the stream actually playing.
const MAX_CONCURRENT_PROBES = 6;

const readCache = () => {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    const now = Date.now();
    const fresh = {};

    Object.entries(parsed).forEach(([url, entry]) => {
      if (entry && now - entry.at < CACHE_TTL_MS) fresh[url] = entry;
    });

    return fresh;
  } catch {
    return {};
  }
};

const writeCache = (cache) => {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or disabled — probing simply repeats next visit.
  }
};

// Resolves true if the stream's manifest loads, false if it fatally errors
// or never answers. Deliberately mirrors HlsPlayer's own attach logic so a
// channel is hidden exactly when the player would have shown its error.
const probeStream = (url) =>
  new Promise((resolve) => {
    if (!url) {
      resolve(false);
      return;
    }

    let settled = false;
    let timer = null;
    let cleanup = () => {};

    const finish = (available) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      resolve(available);
    };

    timer = window.setTimeout(() => finish(false), PROBE_TIMEOUT_MS);

    if (Hls.isSupported()) {
      const hls = new Hls({
        manifestLoadingTimeOut: PROBE_TIMEOUT_MS,
        manifestLoadingMaxRetry: 0,
        levelLoadingMaxRetry: 0,
      });

      cleanup = () => hls.destroy();

      hls.on(Hls.Events.MANIFEST_PARSED, () => finish(true));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) finish(false);
      });

      // No attachMedia() on purpose: without a media element hls.js stops
      // after parsing the manifest and never starts pulling segments, so
      // a probe costs one small request rather than real video traffic.
      hls.loadSource(url);
      return;
    }

    // Safari and friends play HLS natively — probe through a detached
    // element the same way HlsPlayer falls back to a plain src there.
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";

    cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    video.addEventListener("loadedmetadata", () => finish(true));
    video.addEventListener("error", () => finish(false));
    video.src = url;
  });

const runWithConcurrency = async (items, limit, worker) => {
  let cursor = 0;

  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index]);
      }
    },
  );

  await Promise.all(runners);
};

// Verdicts are keyed by stream URL, not channel id, so editing a channel's
// URL in admin retests it instead of inheriting the old channel's result.
export const useLiveTvAvailability = (channels) => {
  const [availability, setAvailability] = useState(() => {
    const cache = readCache();
    const initial = {};
    Object.entries(cache).forEach(([url, entry]) => {
      initial[url] = entry.available;
    });
    return initial;
  });

  // The effect must not re-run when a verdict lands, so what's already
  // known is tracked in a ref and only mirrored into state for rendering.
  const knownRef = useRef({ ...availability });
  const cacheRef = useRef(readCache());

  useEffect(() => {
    const pending = [
      ...new Set(
        (channels || [])
          .filter(
            (channel) =>
              channel.channelType === "external" &&
              channel.streamUrl &&
              knownRef.current[channel.streamUrl] === undefined,
          )
          .map((channel) => channel.streamUrl),
      ),
    ];

    if (pending.length === 0) return undefined;

    let cancelled = false;

    runWithConcurrency(pending, MAX_CONCURRENT_PROBES, async (url) => {
      if (cancelled) return;

      const available = await probeStream(url);
      if (cancelled) return;

      knownRef.current[url] = available;
      cacheRef.current[url] = { available, at: Date.now() };
      writeCache(cacheRef.current);
      setAvailability((current) => ({ ...current, [url]: available }));
    });

    return () => {
      cancelled = true;
    };
  }, [channels]);

  // Called by the player when a channel that passed its probe still fails
  // during playback — the one case a manifest check can't catch.
  const markUnavailable = useCallback((url) => {
    if (!url || knownRef.current[url] === false) return;

    knownRef.current[url] = false;
    cacheRef.current[url] = { available: false, at: Date.now() };
    writeCache(cacheRef.current);
    setAvailability((current) => ({ ...current, [url]: false }));
  }, []);

  // Unknown counts as available: a channel shows immediately and is only
  // pulled once its probe has actually come back negative.
  const isAvailable = useCallback(
    (channel) => {
      if (!channel || channel.channelType !== "external") return true;
      return availability[channel.streamUrl] !== false;
    },
    [availability],
  );

  return { isAvailable, markUnavailable };
};

export default useLiveTvAvailability;
