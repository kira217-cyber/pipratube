import { frameHash, frameTimes, isAdultFrame, mergeZoom, needsZoom, videoVerdict, ZOOM } from "./moderationRules";

// The browser's adult-content check, run while the file uploads. The file
// is already on this device, so frames are read straight from it (no
// download) and scored by nsfwjs (MobileNetV2) in a Web Worker — the same
// model and the same rules (moderationRules.js) the server uses afterwards.
// It doesn't touch the network or block the page, so the upload keeps its
// full speed.
//
// Resolves with { verdict, adultFrames, peak, checked, frames, hashes,
// evidence } — hashes are the frames' fingerprints, which recognise a video
// that was removed before — or null when this browser can't read the video (AVI, WMV…) — the server
// checks those.

const SIZE = 224;

// The model runs in a Web Worker (videoCheck.worker.js), so loading it and
// scoring frames never blocks the page — the upload keeps full speed.
let worker = null;
let nextId = 0;
const pending = new Map();

const ask = (message, transfer) => {
  if (!worker) {
    worker = new Worker(new URL("./videoCheck.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.ok) job.resolve(data);
      else job.reject(new Error(data.error));
    };
    worker.onerror = (event) => {
      pending.forEach((job) => job.reject(new Error(event.message || "worker failed")));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = (nextId += 1);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...message, id }, transfer || []);
  });
};

const classify = async (data) => {
  const pixels = data.buffer;
  const { scores } = await ask({ type: "classify", pixels }, [pixels]);
  return scores;
};

// Scores what `source` (a video frame or a picture, `width` × `height`)
// shows: whole, then zoomed in on the centre when that looks suspicious —
// the same as the server (moderationRules.js).
const scoreSource = async (context, source, width, height) => {
  context.drawImage(source, 0, 0, SIZE, SIZE);
  const data = context.getImageData(0, 0, SIZE, SIZE).data;
  const hash = frameHash(data, 4);
  const full = await classify(data);
  if (!needsZoom(full)) return { scores: full, hash };
  const w = width * ZOOM;
  const h = height * ZOOM;
  context.drawImage(source, (width - w) / 2, (height - h) / 2, w, h, 0, 0, SIZE, SIZE);
  return { scores: mergeZoom(full, await classify(context.getImageData(0, 0, SIZE, SIZE).data)), hash };
};

const waitFor = (target, event, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${event} timed out`));
    }, ms);
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("video error"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(event, done);
      target.removeEventListener("error", fail);
    };
    target.addEventListener(event, done);
    target.addEventListener("error", fail);
  });

export const checkVideoFile = async (file, { onProgress } = {}) => {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await waitFor(video, "loadeddata", 15000);
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth) return null;

    const loading = ask({ type: "load" });
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const times = frameTimes(duration);
    const frames = [];
    const hashes = [];
    const evidence = [];
    for (const [index, t] of times.entries()) {
      try {
        video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
        await waitFor(video, "seeked", 8000);
        await loading;
        const { scores, hash } = await scoreSource(context, video, video.videoWidth, video.videoHeight);
        if (hash) hashes.push(hash);
        frames.push({ t, scores });
        // A picture of a flagged frame for the reviewer (at most 4).
        if (isAdultFrame(scores) && evidence.length < 4) {
          const shot = document.createElement("canvas");
          shot.width = 480;
          shot.height = Math.round((480 * video.videoHeight) / video.videoWidth) || 270;
          shot.getContext("2d").drawImage(video, 0, 0, shot.width, shot.height);
          const blob = await new Promise((resolve) => shot.toBlob(resolve, "image/jpeg", 0.7));
          if (blob) evidence.push({ t, scores, blob });
        }
      } catch {
        // An unreadable moment — skip it.
      }
      onProgress?.(Math.round(((index + 1) / times.length) * 100));
    }
    if (frames.length < Math.min(5, times.length)) return null;

    const result = videoVerdict(frames);
    return {
      ...result,
      // Only the frames that matter go to the server.
      frames: evidence.map(({ t, scores }) => ({ t, scores })),
      hashes,
      evidence,
    };
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
};

// A picture (a thumbnail): is it pornographic? False when it can't be read
// — the server checks it again anyway.
export const isAdultPicture = async (file) => {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const { scores } = await scoreSource(context, bitmap, bitmap.width, bitmap.height);
    bitmap.close?.();
    return isAdultFrame(scores);
  } catch {
    return false;
  }
};

export default checkVideoFile;
