// Browser-side helpers for the upload flows: shrink images before they're
// sent, read a video's length/size, and grab frames to use as thumbnails.

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Couldn't read that image"));
    image.src = src;
  });

const canvasToFile = (canvas, name, type = "image/webp", quality = 0.86) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name, { type: blob.type })) : reject(new Error("Couldn't encode image"))),
      type,
      quality,
    );
  });

// Every picture type we take — the server converts them all to WebP.
export const IMAGE_ACCEPT = "image/*,.heic,.heif,.avif,.jfif,.tif,.tiff,.bmp,.ico,.svg,.psd,.tga,.dds,.exr,.hdr,.qoi,.pcx";
export const MAX_IMAGE_MB = 100;

// Scales an image down to fit `maxWidth` × `maxHeight` and re-encodes it
// as WebP — a 4 MB phone photo becomes ~150 KB. GIFs pass through untouched,
// and so does anything the browser can't open (HEIC, TIFF, PSD…): the
// server converts those.
export const compressImage = async (file, { maxWidth = 1280, maxHeight = 1280 } = {}) => {
  if (!file || file.type === "image/gif") return file;
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url).catch(() => null);
    if (!image) return file;
    const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const base = (file.name || "image").replace(/\.[^.]+$/, "");
    const out = await canvasToFile(canvas, `${base}.webp`);
    return out.size < file.size ? out : file;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const openVideo = (file) =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => resolve({ video, url });
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This video can't be read by the browser — try MP4"));
    };
    video.src = url;
  });

const seek = (video, time) =>
  new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = time;
  });

// { durationSeconds, width, height } plus up to `frames` thumbnail
// candidates (16:9 or 9:16 to match the video) as Files.
export const inspectVideo = async (file, { frames = 3 } = {}) => {
  const { video, url } = await openVideo(file);
  try {
    const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const candidates = [];

    if (durationSeconds > 0 && width && height) {
      const scale = Math.min(1, 1280 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");

      for (let i = 1; i <= frames; i += 1) {
        try {
          await seek(video, (durationSeconds * i) / (frames + 1));
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          candidates.push(await canvasToFile(canvas, `frame-${i}.webp`, "image/webp", 0.82));
        } catch {
          // Some codecs refuse to draw — fewer candidates is fine.
        }
      }
    }

    return { durationSeconds, width, height, candidates };
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};
