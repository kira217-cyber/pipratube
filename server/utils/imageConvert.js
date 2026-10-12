import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import sharp from "sharp";
import decodeHeic from "heic-decode";

// Any picture people upload — JPG, PNG, WEBP, GIF, AVIF, TIFF, SVG, BMP,
// iPhone HEIC, PSD, ICO… — is turned into one WebP that every browser shows
// (animated GIFs stay animated). It's also shrunk to a sensible size, so a
// 100 MB camera photo doesn't become a 100 MB avatar.
//
//   1. sharp reads most formats directly.
//   2. iPhone HEIC/HEIF (HEVC inside) goes through heic-decode.
//   3. Anything else (BMP, ICO, PSD, TGA, PCX, DDS, EXR…) through ffmpeg.

const require = createRequire(import.meta.url);
const FFMPEG = process.env.FFMPEG_PATH || require("ffmpeg-static");
const MAX_SIDE = 3840;

export const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB) || 100;

const toWebp = (input, options) =>
  sharp(input, { animated: true, failOn: "none", limitInputPixels: 1e9, ...options })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86, effort: 4 })
    .toBuffer();

const isHeif = (buffer) => /^ftyp(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(buffer.subarray(4, 12).toString("latin1"));

const fromHeic = async (buffer) => {
  const { width, height, data } = await decodeHeic({ buffer });
  return toWebp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 }, animated: false });
};

const fromFfmpeg = async (buffer, originalName) => {
  const ext = (path.extname(originalName || "") || ".img").slice(0, 10);
  const input = path.join(os.tmpdir(), `pipra-img-${randomUUID()}${ext}`);
  await fsp.writeFile(input, buffer);
  try {
    const png = await new Promise((resolve, reject) => {
      const child = spawn(FFMPEG, ["-v", "error", "-i", input, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1"], { windowsHide: true });
      const chunks = [];
      child.stdout.on("data", (chunk) => chunks.push(chunk));
      child.on("error", reject);
      child.on("close", (code) => (code === 0 && chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error("ffmpeg couldn't read it"))));
    });
    return await toWebp(png, { animated: false });
  } finally {
    fsp.unlink(input).catch(() => {});
  }
};

// Returns a WebP buffer, or throws a 400-style error for a file that isn't
// a picture at all.
export const convertImage = async (buffer, originalName) => {
  const attempts = isHeif(buffer) ? [() => fromHeic(buffer), () => toWebp(buffer)] : [() => toWebp(buffer)];
  attempts.push(() => fromFfmpeg(buffer, originalName));
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch {
      // try the next reader
    }
  }
  throw Object.assign(new Error("We couldn't read this image — please try another picture"), { status: 400 });
};
