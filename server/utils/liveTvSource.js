// The public IPTV channel list the admin panel autofills new Live TV
// channels from.
//
// raw.githubusercontent.com answers 429 ("Too Many Requests") to an IP that
// pulls the same file repeatedly, which is exactly what happens here — the
// admin panel refetches this list every time the Live TV page mounts. Two
// things keep that from breaking the page:
//
//   • jsDelivr, a CDN built to serve files out of GitHub repos, is tried
//     first; raw.githubusercontent.com is only the fallback.
//   • The parsed list is cached in memory, so repeated visits don't hit the
//     network at all — and if every mirror is down, the last good copy is
//     served rather than an error.
const SOURCE_URLS = [
  "https://cdn.jsdelivr.net/gh/abusaeeidx/Mrgify-BDIX-IPTV@main/Channels_data.json",
  "https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/Channels_data.json",
];

const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;

let cache = null; // { channels, at }

const fetchFrom = async (url) => {
  const response = await fetch(url, {
    headers: {
      // GitHub is stricter with clients that don't identify themselves.
      "User-Agent": "Pipra-TV-v2-Server",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} responded ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data?.channels)) {
    throw new Error(`${new URL(url).hostname} returned an unexpected format`);
  }

  return data.channels;
};

// Resolves to { channels, stale }. `stale` is true when every mirror failed
// and a previously cached copy is being served instead.
export const loadLiveTvSourceChannels = async () => {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { channels: cache.channels, stale: false };
  }

  const failures = [];

  for (const url of SOURCE_URLS) {
    try {
      const channels = await fetchFrom(url);
      cache = { channels, at: Date.now() };
      return { channels, stale: false };
    } catch (error) {
      failures.push(error.message);
    }
  }

  if (cache) return { channels: cache.channels, stale: true };

  throw new Error(
    `Could not reach the channel source list — ${failures.join("; ")}`,
  );
};
