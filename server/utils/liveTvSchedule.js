// Resolves "what should a scheduled Live TV channel be playing right now,
// and at what offset" — the same question a real broadcast answers
// implicitly, since pre-recorded videos play back-to-back on a fixed
// clock instead of on demand. All times are compared against the
// server's own local wall clock (admin sets schedule times expecting
// that same reference frame).
const parseTimeToMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

const dateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Given a channel's schedule, finds the slot whose [start, start+duration)
// window contains `now`. A one-time dated slot wins over a recurring one
// at the same moment (treated as a "special program" override); among
// slots of the same kind, the one that started most recently wins.
export const resolveNowPlaying = (channel, now = new Date()) => {
  const today = dateString(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  const candidates = (channel.schedule || [])
    .filter((entry) => !entry.date || entry.date === today)
    .map((entry) => {
      const startMinutes = parseTimeToMinutes(entry.startTime);
      const endMinutes = startMinutes + (entry.durationSeconds || 0) / 60;
      return { entry, startMinutes, endMinutes, isDated: Boolean(entry.date) };
    })
    .filter((c) => nowMinutes >= c.startMinutes && nowMinutes < c.endMinutes);

  candidates.sort((a, b) => {
    if (a.isDated !== b.isDated) return a.isDated ? -1 : 1;
    return b.startMinutes - a.startMinutes;
  });

  const match = candidates[0];
  if (!match) return null;

  const offsetSeconds = Math.max(0, Math.round((nowMinutes - match.startMinutes) * 60));

  return {
    video: match.entry.video,
    offsetSeconds,
  };
};

// Finds the soonest schedule slot that will start within the next
// `lookaheadSeconds` but hasn't started yet — lets the client start
// preloading that video's file a few seconds early so the transition at
// airtime is instant instead of stalling to buffer.
export const resolveUpcoming = (channel, now = new Date(), lookaheadSeconds = 5) => {
  const today = dateString(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const lookaheadMinutes = lookaheadSeconds / 60;

  const candidates = (channel.schedule || [])
    .filter((entry) => !entry.date || entry.date === today)
    .map((entry) => ({ entry, startMinutes: parseTimeToMinutes(entry.startTime) }))
    .filter(
      (c) => c.startMinutes > nowMinutes && c.startMinutes - nowMinutes <= lookaheadMinutes,
    );

  candidates.sort((a, b) => a.startMinutes - b.startMinutes);

  const next = candidates[0];
  if (!next) return null;

  return {
    video: next.entry.video,
    startsInSeconds: Math.max(0, Math.round((next.startMinutes - nowMinutes) * 60)),
  };
};

// Stateless "endless loop" playlist for the "all time" fallback videos —
// plays whenever nothing in the schedule matches. Every viewer computes
// the same video + offset from the Unix epoch (mod the pool's total
// duration), so simultaneous viewers all land on the exact same moment in
// the exact same video without needing to store any loop-start state.
export const resolveAllTimeVideo = (allTimeVideos, now = new Date()) => {
  const entries = (allTimeVideos || []).filter((entry) => entry?.durationSeconds > 0);
  if (entries.length === 0) return null;

  const totalDuration = entries.reduce((sum, entry) => sum + entry.durationSeconds, 0);
  if (totalDuration <= 0) return null;

  const nowSeconds = Math.floor(now.getTime() / 1000);
  let position = nowSeconds % totalDuration;

  for (const entry of entries) {
    if (position < entry.durationSeconds) {
      return { video: entry.video, offsetSeconds: position };
    }
    position -= entry.durationSeconds;
  }

  // Unreachable in practice (position is always < totalDuration), but
  // falls back to the first video at offset 0 rather than returning
  // nothing if float/rounding ever puts position exactly at the edge.
  return { video: entries[0].video, offsetSeconds: 0 };
};
