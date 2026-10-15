import { spawn } from "node:child_process";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-wasm";
import { load } from "nsfwjs/core";
import { MobileNetV2Model } from "nsfwjs/models/mobilenet_v2";

import sharp from "sharp";

import { frameHash, frameTimes, isAdultFrame, mergeZoom, needsZoom, videoVerdict, ZOOM } from "./rules.js";
import { saveLocalImage } from "../localFiles.js";
import { ffmpegPath, noteMediaFailure } from "../ffmpegBin.js";
import { ffmpegInput } from "../mediaProxy.js";
import os from "node:os";

// The server's adult-content check. It never downloads the whole video: for
// each moment it asks ffmpeg for one frame, read straight from the video's
// URL (Bunny's MP4 copy) with a range request, so a two-hour film costs a few
// MB. Frames go through nsfwjs (MobileNetV2) on TensorFlow's WebAssembly
// backend — ~50 ms a frame, on any CPU (ARM included); a suspicious frame is
// scored again zoomed in on its centre (rules.js). Frames that look
// pornographic are kept as small JPEGs so an admin can see why.

const FFMPEG = ffmpegPath();
const SIZE = 224;
// Frames are read at twice the model's size, so the zoomed-in centre still
// has real detail — from the one read, no second trip to the network.
const BIG = SIZE * 2;
// Frames read at once: fewer on a small server, so ffmpeg never runs it out of memory.
const READERS = os.totalmem() < 3 * 1024 ** 3 ? 2 : 4;

let modelPromise = null;
const getModel = () => {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.setBackend("wasm");
      await tf.ready();
      return load("MobileNetV2", { modelDefinitions: [MobileNetV2Model] });
    })().catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
};

// Web addresses are read through the local relay (mediaProxy.js), never by
// ffmpeg's own network code.
const ffmpegFrame = async (source, seconds, outputArgs, timeoutMs = 45000) => {
  const input = await ffmpegInput(source);
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      ...(input !== source ? ["-rw_timeout", "20000000"] : []),
      "-ss", String(seconds),
      "-i", input,
      "-frames:v", "1",
      ...outputArgs,
      "pipe:1",
    ];
    const child = spawn(FFMPEG, args, { windowsHide: true });
    const chunks = [];
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => {
      err = (err + c).slice(-500);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks);
      if (code === 0 && out.length) resolve(out);
      else reject(new Error(err.trim().split("\n").pop() || (code === null ? `ffmpeg was stopped (took over ${timeoutMs / 1000}s or ran out of memory)` : `ffmpeg exited ${code}`)));
    });
  });
};

const rawFrame = (source, seconds) => ffmpegFrame(source, seconds, ["-vf", `scale=${BIG}:${BIG}`, "-f", "rawvideo", "-pix_fmt", "rgb24"]);
export const jpegFrame = (source, seconds, width = 480) => ffmpegFrame(source, seconds, ["-vf", `scale=${width}:-2`, "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "4"]);

const classify = async (model, raw) => {
  if (raw.length !== SIZE * SIZE * 3) throw new Error("bad frame size");
  const image = tf.tensor3d(new Int32Array(raw), [SIZE, SIZE, 3], "int32");
  try {
    const predictions = await model.classify(image);
    const scores = { Porn: 0, Sexy: 0, Hentai: 0, Neutral: 0, Drawing: 0 };
    predictions.forEach((p) => {
      scores[p.className] = Math.round(p.probability * 1000) / 10;
    });
    return scores;
  } finally {
    image.dispose();
  }
};

// Scores one picture (any size, as sharp input): whole, then zoomed in on
// the centre when that looks suspicious. Also returns the whole picture at
// the model's size (for the fingerprint).
const scorePicture = async (model, input) => {
  const meta = await sharp(input.data || input, input.raw ? { raw: input.raw } : { failOn: "none" }).metadata();
  const open = () => sharp(input.data || input, input.raw ? { raw: input.raw } : { failOn: "none", animated: false });
  const full = await open().rotate().resize(SIZE, SIZE, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const scores = await classify(model, full);
  if (!needsZoom(scores)) return { scores, full };
  const width = Math.round(meta.width * ZOOM);
  const height = Math.round(meta.height * ZOOM);
  const zoomed = await open()
    .rotate()
    .extract({ left: Math.round((meta.width - width) / 2), top: Math.round((meta.height - height) / 2), width, height })
    .resize(SIZE, SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  return { scores: mergeZoom(scores, await classify(model, zoomed)), full };
};

// Checks the video at `source` (a URL or a file path) of `duration` seconds.
// Returns the verdict, every frame's scores, and saved pictures of the
// frames that looked pornographic.
export const checkVideoSource = async (source, duration) => {
  const model = await getModel();
  // Reading a frame off the network is the slow part (a second or two each),
  // so a few are read at once; scoring them is quick and done one by one.
  const times = frameTimes(duration);
  const frames = [];
  let next = 0;
  let failures = 0;
  let lastError = null;
  const worker = async () => {
    while (next < times.length) {
      const t = times[next++];
      if (failures >= 8 && frames.length === 0) return;
      try {
        const data = await rawFrame(source, t);
        const { scores, full } = await scorePicture(model, { data, raw: { width: BIG, height: BIG, channels: 3 } });
        frames.push({ t, scores, hash: frameHash(full, 3) });
      } catch (error) {
        failures += 1;
        lastError = error;
      }
    }
  };
  await Promise.all(Array.from({ length: READERS }, worker));
  if (!frames.length) {
    // Say why (ffmpeg missing, the CDN refusing, an unreadable file…).
    const reason = `Couldn't read frames from the video: ${lastError?.message || "unknown error"}`;
    noteMediaFailure(`${reason} (${String(source).slice(0, 120)})`);
    throw new Error(reason);
  }
  frames.sort((a, b) => a.t - b.t);

  const result = videoVerdict(frames);
  const evidence = [];
  for (const frame of frames.filter((f) => isAdultFrame(f.scores)).slice(0, 6)) {
    try {
      const saved = await saveLocalImage(await jpegFrame(source, frame.t), "moderation", "frame.jpg");
      evidence.push({ t: frame.t, image: saved, scores: frame.scores });
    } catch {
      evidence.push({ t: frame.t, image: null, scores: frame.scores });
    }
  }
  return { ...result, frames, evidence, hashes: frames.map((f) => f.hash).filter(Boolean) };
};

// One picture (thumbnail, avatar, banner): is it pornographic? Pictures
// that can't be read are left to the image converter to refuse.
export const isAdultImage = async (buffer) => {
  try {
    const { scores } = await scorePicture(await getModel(), buffer);
    return isAdultFrame(scores);
  } catch {
    return false;
  }
};

export default checkVideoSource;
