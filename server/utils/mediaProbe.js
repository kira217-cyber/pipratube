import { spawn } from "node:child_process";
import { FFPROBE, ffmpegPath } from "./ffmpegBin.js";
import { ffmpegInput } from "./mediaProxy.js";

// Length, size (as displayed, after rotation) and codecs of a video file or
// URL — with ffprobe when this server has one (see ffmpegBin.js), otherwise
// read from `ffmpeg -i` (ffprobe-static has no ARM build).

const collect = (bin, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (c) => {
      out += c;
    });
    child.stderr.on("data", (c) => {
      err = (err + c).slice(-20000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });

const fromFfprobe = async (source, inputArgs, timeoutMs) => {
  const { code, out, err } = await collect(FFPROBE, ["-v", "error", ...inputArgs, "-print_format", "json", "-show_format", "-show_streams", source], timeoutMs);
  if (code !== 0) throw new Error(err.trim().split("\n").pop() || "Couldn't read the video");
  const json = JSON.parse(out);
  const video = json.streams?.find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
  const audio = json.streams?.find((s) => s.codec_type === "audio");
  if (!video) return null;
  return {
    duration: Number(json.format?.duration) || Number(video.duration) || 0,
    width: Number(video.width) || 0,
    height: Number(video.height) || 0,
    rotation: Math.abs(Number(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0)) % 180,
    format: json.format?.format_name || "",
    videoCodec: video.codec_name || "",
    pixelFormat: video.pix_fmt || "",
    audioCodec: audio?.codec_name || null,
  };
};

// `ffmpeg -i` with no output prints the file's details and exits (code 1).
const fromFfmpeg = async (source, inputArgs, timeoutMs) => {
  const { err } = await collect(ffmpegPath(), ["-hide_banner", ...inputArgs, "-i", source], timeoutMs);
  const lines = err.split(/\r?\n/);
  const videoAt = lines.findIndex((l) => /Stream #\d+:\d+.*: Video: /.test(l) && !/attached pic/.test(l));
  if (videoAt < 0) {
    if (!/Input #0/.test(err)) throw new Error(lines.filter(Boolean).pop() || "Couldn't read the video");
    return null;
  }
  const videoLine = lines[videoAt];
  const audioLine = lines.find((l) => /Stream #\d+:\d+.*: Audio: /.test(l)) || "";
  const time = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  const size = /, (\d{2,5})x(\d{2,5})[\s,]/.exec(videoLine);
  // Rotation is listed under the stream, before the next stream starts.
  const after = [];
  for (let i = videoAt + 1; i < lines.length && !/^\s*Stream #/.test(lines[i]); i += 1) after.push(lines[i]);
  const rotate = /rotate\s*:\s*(-?\d+)|rotation of (-?[\d.]+) degrees/.exec(after.join("\n"));
  return {
    duration: time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : 0,
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0,
    rotation: rotate ? Math.abs(Math.round(Number(rotate[1] ?? rotate[2]))) % 180 : 0,
    format: /Input #0, ([^ ]+), from/.exec(err)?.[1]?.replace(/,$/, "") || "",
    videoCodec: /Video: (\w+)/.exec(videoLine)?.[1] || "",
    pixelFormat: /Video: \w+[^,]*, (\w+)/.exec(videoLine)?.[1] || "",
    audioCodec: /Audio: (\w+)/.exec(audioLine)?.[1] || null,
  };
};

// Web addresses are read through the local relay (mediaProxy.js), which
// also sends the Referer the CDN asks for.
// Resolves with null when the file has no video track; throws when it can't
// be read at all.
export const probeMedia = async (source, { timeoutMs = 30000 } = {}) => {
  const input = await ffmpegInput(source);
  const inputArgs = input !== source ? ["-rw_timeout", "15000000"] : [];
  const info = FFPROBE ? await fromFfprobe(input, inputArgs, timeoutMs) : await fromFfmpeg(input, inputArgs, timeoutMs);
  if (!info) return null;
  const { rotation, width, height, ...rest } = info;
  return { ...rest, width: rotation === 90 ? height : width, height: rotation === 90 ? width : height };
};

export const usingFfprobe = Boolean(FFPROBE);

export default probeMedia;
