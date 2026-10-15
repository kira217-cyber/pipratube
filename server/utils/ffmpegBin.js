import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// Which ffmpeg / ffprobe this server can actually run. The system's own
// (`sudo apt install ffmpeg`) comes first: the npm builds (ffmpeg-static,
// ffprobe-static) are fully static, and a static build often can't look up
// host names on Linux servers — so it can't open a video URL on the CDN even
// though it runs. The npm builds are the fallback when the system has none
// (or on Windows / Mac for development). FFMPEG_PATH / FFPROBE_PATH override
// both.

const require = createRequire(import.meta.url);

const npmPath = (name, pick) => {
  try {
    return pick(require(name));
  } catch {
    return null;
  }
};

const runs = (bin) => {
  if (!bin) return false;
  if (bin.includes("/") || bin.includes("\\")) {
    if (!fs.existsSync(bin)) return false;
  }
  try {
    const result = spawnSync(bin, ["-version"], { windowsHide: true, timeout: 10000 });
    return result.status === 0;
  } catch {
    return false;
  }
};

const firstWorking = (candidates) => candidates.find(runs) || null;

export const FFMPEG = firstWorking([process.env.FFMPEG_PATH, "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", npmPath("ffmpeg-static", (p) => p), "ffmpeg"]);
export const FFPROBE = firstWorking([process.env.FFPROBE_PATH, "/usr/bin/ffprobe", "/usr/local/bin/ffprobe", npmPath("ffprobe-static", (p) => p.path), "ffprobe"]);

if (FFMPEG) console.log(`ffmpeg: ${FFMPEG}${FFPROBE ? ` · ffprobe: ${FFPROBE}` : " · no ffprobe (reading details with ffmpeg)"}`);
else console.error("ffmpeg NOT FOUND — videos can't be checked or started quickly. Fix: sudo apt install ffmpeg");
if (FFMPEG && /node_modules/.test(FFMPEG) && process.platform === "linux") console.warn("ffmpeg: using the npm static build — if checks fail with \"Failed to resolve hostname\", run: sudo apt install ffmpeg");

// The path to hand to spawn(); falls back to "ffmpeg" so the error says what's missing.
export const ffmpegPath = () => FFMPEG || "ffmpeg";

// For /api/health: which tools work, and the last reason reading a video failed.
let lastFailure = null;
export const noteMediaFailure = (message) => {
  lastFailure = { message: String(message || "").slice(0, 300), at: new Date().toISOString() };
};
const version = (bin) => {
  try {
    return String(spawnSync(bin, ["-version"], { windowsHide: true, timeout: 10000 }).stdout).split("\n")[0].trim().slice(0, 120);
  } catch {
    return null;
  }
};
const kind = (bin) => (!bin ? null : /node_modules/.test(bin) ? "npm" : "system");
const FFMPEG_VERSION = FFMPEG ? version(FFMPEG) : null;
export const mediaToolsStatus = () => ({
  ffmpeg: FFMPEG ? { source: kind(FFMPEG), version: FFMPEG_VERSION } : "MISSING — sudo apt install ffmpeg",
  ffprobe: FFPROBE ? { source: kind(FFPROBE) } : "not installed (ffmpeg is used instead)",
  lastFailure,
});
