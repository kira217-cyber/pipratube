// The adult-content rules, shared word for word by the browser check
// (studio/src/utils/moderationRules.js) and the server check, so both reach
// the same answer for the same frames.
//
// What's held for review: pornography and sexual / nude content. What must
// still go out: ordinary videos — dancing, swimwear, cooking, people talking
// — and songs or films with a brief steamy moment. So:
//   • every frame is scored whole; a frame that looks suspicious is also
//     scored zoomed in on its centre (where the subject usually is), and a
//     sure zoomed score counts — small or framed-in content isn't missed;
//   • a frame where ordinary content clearly dominates never counts;
//   • a video is held when it's explicit for a good part of it — at least
//     3 frames and a quarter of everything checked — or has one long
//     explicit stretch (20 seconds or more, frame after frame).
// Scores are percentages (0–100) from nsfwjs (MobileNetV2).

export const RULES_VERSION = 5;

// How many frames to look at: dense for short clips, about one a minute
// for long films (never fewer than 10, never more than 120).
export const frameCount = (duration) => {
  const d = Math.max(1, Number(duration) || 0);
  if (d <= 60) return Math.max(10, Math.ceil(d / 2));
  return Math.min(120, 30 + Math.ceil((d - 60) / 60));
};

// Evenly spread moments, skipping the very first and last instants (often black).
export const frameTimes = (duration) => {
  const d = Math.max(1, Number(duration) || 0);
  const count = frameCount(d);
  const margin = Math.min(1, d * 0.03);
  const span = Math.max(0.1, d - margin * 2);
  return Array.from({ length: count }, (_, i) => Math.round((margin + (count === 1 ? span / 2 : (i / (count - 1)) * span)) * 100) / 100);
};

// The centre part looked at more closely (a fraction of width and height).
export const ZOOM = 0.65;

// Is the whole-frame score suspicious enough to look closer?
export const needsZoom = (scores = {}) => (scores.Porn || 0) >= 38 || (scores.Hentai || 0) >= 38 || ((scores.Sexy || 0) >= 50 && (scores.Neutral || 0) < 35);

// One frame's scores: the whole frame's, with Porn / Hentai raised to the
// zoomed-in score when that one is sure (50%+).
export const mergeZoom = (full, zoomed) => {
  if (!zoomed) return full;
  const merged = { ...full, zoomed: true };
  if ((zoomed.Porn || 0) >= 50 && zoomed.Porn > (full.Porn || 0)) merged.Porn = zoomed.Porn;
  if ((zoomed.Hentai || 0) >= 50 && zoomed.Hentai > (full.Hentai || 0)) merged.Hentai = zoomed.Hentai;
  return merged;
};

// One frame (or one picture): is it pornographic / sexual?
export const isAdultFrame = (scores = {}) => {
  const porn = scores.Porn || 0;
  const hentai = scores.Hentai || 0;
  const neutral = scores.Neutral || 0;
  // Ordinary content clearly in charge (cooking, hands, faces…).
  if (neutral >= 45 && neutral >= porn + hentai) return false;
  return porn >= 60 || hentai >= 60 || (porn + hentai >= 65 && neutral < 25);
};

const LONG_STRETCH_SECONDS = 20;

// The longest run of explicit frames in a row: how many, and how long.
const longestStretch = (frames) => {
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  let best = { count: 0, seconds: 0 };
  let start = -1;
  sorted.forEach((f, i) => {
    if (!isAdultFrame(f.scores)) {
      start = -1;
      return;
    }
    if (start < 0) start = i;
    const run = { count: i - start + 1, seconds: f.t - sorted[start].t };
    if (run.count > best.count || (run.count === best.count && run.seconds > best.seconds)) best = run;
  });
  return best;
};

// The whole video: "flagged" (held for review) or "clean".
export const videoVerdict = (frames = []) => {
  const adult = frames.filter((f) => isAdultFrame(f.scores));
  const peak = Math.max(0, ...frames.map((f) => Math.max(f.scores?.Porn || 0, f.scores?.Hentai || 0)));
  const stretch = longestStretch(frames);
  const throughout = adult.length >= Math.max(3, Math.ceil(frames.length * 0.25));
  const longScene = stretch.count >= 3 && stretch.seconds >= LONG_STRETCH_SECONDS;
  return { verdict: throughout || longScene ? "flagged" : "clean", adultFrames: adult.length, peak: Math.round(peak), checked: frames.length };
};

// ---------- fingerprints ----------
//
// A 64-bit "difference hash" of a 224×224 frame: the picture shrunk to 9×8
// greys, one bit per neighbour pair (is the left one brighter?). Re-encoding,
// resizing or a watermark barely change it, so a video that was removed for
// pornography is recognised when someone uploads it again. `channels` is 3
// for RGB pixels, 4 for RGBA. Plain, nearly single-colour frames (black,
// white, a smooth gradient) say nothing about the video and give null.

const SIDE = 224;

export const frameHash = (pixels, channels = 3) => {
  const greys = [];
  for (let row = 0; row < 8; row += 1) {
    const y0 = Math.floor((row * SIDE) / 8);
    const y1 = Math.floor(((row + 1) * SIDE) / 8);
    for (let col = 0; col < 9; col += 1) {
      const x0 = Math.floor((col * SIDE) / 9);
      const x1 = Math.floor(((col + 1) * SIDE) / 9);
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * SIDE + x) * channels;
          sum += pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
          n += 1;
        }
      }
      greys.push(sum / n);
    }
  }
  if (Math.max(...greys) - Math.min(...greys) < 16) return null;
  let hex = "";
  let ones = 0;
  for (let row = 0; row < 8; row += 1) {
    let byte = 0;
    for (let col = 0; col < 8; col += 1) {
      const bit = greys[row * 9 + col] > greys[row * 9 + col + 1] ? 1 : 0;
      byte = (byte << 1) | bit;
      ones += bit;
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return ones < 8 || ones > 56 ? null : hex;
};

const bits = (n) => {
  let v = n >>> 0;
  let count = 0;
  while (v) {
    v &= v - 1;
    count += 1;
  }
  return count;
};

// How many of the 64 bits differ between two fingerprints.
export const hashDistance = (a, b) => bits(parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) + bits(parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16));

export default { RULES_VERSION, ZOOM, frameCount, frameTimes, needsZoom, mergeZoom, isAdultFrame, videoVerdict, frameHash, hashDistance };
