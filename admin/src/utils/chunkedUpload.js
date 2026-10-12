import { Upload } from "tus-js-client";

import { api } from "../api/client";

// Sends a video to the API in 8 MB pieces (server: routes/uploads.js), so
// files of any size — up to 50 GB — go through without one giant request.
//
// Speed: PARALLEL pieces travel at once. One request at a time leaves the
// connection idle between pieces and can't fill a long-distance link; a few
// side by side keep it busy, often several times faster.
//
// Reliability: a failed piece is retried with a growing pause; after a
// dropped connection the server says which pieces it already has and only
// the rest are sent again.

const PARALLEL = 4;
const RETRIES = 6;

const cancelled = () => Object.assign(new Error("canceled"), { name: "CanceledError", code: "ERR_CANCELED" });

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(cancelled());
    });
    return undefined;
  });

const isFatal = (error) => {
  const status = error?.response?.status;
  return Boolean(status) && status < 500 && status !== 408 && status !== 429;
};

// Resolves with the uploadId to attach to the new video.
// onProgress(sentBytes, totalBytes) fires many times a second as bytes leave.
export const uploadInChunks = async (file, { client = api, signal, onProgress } = {}) => {
  const { data } = await client.post("/api/uploads", { fileName: file.name, size: file.size }, { signal });
  const { uploadId, chunkSize } = data.data;
  const total = Math.ceil(file.size / chunkSize);

  const pending = Array.from({ length: total }, (_, index) => index);
  const inFlight = new Map(); // piece index → bytes of it sent so far
  let doneBytes = 0;

  const report = () => {
    let sending = 0;
    inFlight.forEach((bytes) => {
      sending += bytes;
    });
    onProgress?.(Math.min(file.size, doneBytes + sending), file.size);
  };
  report();

  const sendPiece = async (index) => {
    const start = index * chunkSize;
    const piece = file.slice(start, Math.min(file.size, start + chunkSize));
    for (let attempt = 0; ; attempt += 1) {
      inFlight.set(index, 0);
      try {
        await client.put(`/api/uploads/${uploadId}?offset=${start}`, piece, {
          signal,
          headers: { "Content-Type": "application/octet-stream" },
          onUploadProgress: (event) => {
            inFlight.set(index, Math.min(event.loaded, piece.size));
            report();
          },
        });
        inFlight.delete(index);
        doneBytes += piece.size;
        report();
        return;
      } catch (error) {
        inFlight.delete(index);
        report();
        if (signal?.aborted || error?.code === "ERR_CANCELED") throw error;
        if (isFatal(error) || attempt >= RETRIES) throw error;
        await wait(Math.min(15000, 800 * 2 ** attempt), signal);
        // Back online? The server may already have this piece.
        try {
          const { data: status } = await client.get(`/api/uploads/${uploadId}`, { signal });
          if (status.data.done?.includes(index)) {
            doneBytes += piece.size;
            report();
            return;
          }
        } catch (checkError) {
          if (signal?.aborted || checkError?.code === "ERR_CANCELED") throw checkError;
          // Still offline — just try the piece again.
        }
      }
    }
  };

  // One piece failing for good stops the other workers taking new pieces.
  let failed = false;
  const worker = async () => {
    while (pending.length && !failed) {
      if (signal?.aborted) throw cancelled();
      try {
        await sendPiece(pending.shift());
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(PARALLEL, total) }, worker));
  onProgress?.(file.size, file.size);
  return uploadId;
};

// ---------- straight to Bunny Stream (the main path) ----------
//
// The file goes from the browser directly to Bunny Stream over TUS — a
// resumable upload protocol — so no video bytes pass through our server.
// Our API only opens the slot and signs a ticket for it. If the connection
// drops, TUS asks Bunny how much arrived and carries on from there.

const uploadToStream = async (file, { client, signal, onProgress }) => {
  const { data } = await client.post("/api/uploads/stream", { fileName: file.name, size: file.size }, { signal });
  const ticket = data.data;
  if (signal?.aborted) throw cancelled();

  return new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: ticket.endpoint,
      // 32 MB pieces, each confirmed by Bunny: the percentage follows what
      // has really arrived (one huge request lets the browser report bytes
      // as "sent" long before they are), and a dropped connection only
      // repeats the current piece.
      chunkSize: 32 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000, 60000],
      headers: {
        AuthorizationSignature: ticket.signature,
        AuthorizationExpire: String(ticket.expires),
        VideoId: ticket.videoId,
        LibraryId: ticket.libraryId,
      },
      metadata: { filetype: file.type || "video/mp4" },
      onProgress: (sent, total) => onProgress?.(sent, total),
      onError: (error) => reject(signal?.aborted ? cancelled() : error),
      onSuccess: () => {
        onProgress?.(file.size, file.size);
        resolve(ticket.videoId);
      },
    });
    signal?.addEventListener("abort", () => {
      upload.abort(true).catch(() => {});
      reject(cancelled());
    });
    upload.start();
  });
};

// Uploads a video the best way available. Resolves with the field to send
// when creating the video: { streamGuid } (Bunny Stream) or
// { sourceUploadId } (pieces through our server, when Stream isn't set up).
export const uploadVideoFile = async (file, { client = api, signal, onProgress } = {}) => {
  let mode = "chunks";
  try {
    const { data } = await client.get("/api/uploads/mode", { signal });
    mode = data.data.mode;
  } catch (error) {
    if (signal?.aborted || error?.code === "ERR_CANCELED") throw error;
  }
  if (mode === "stream") return { streamGuid: await uploadToStream(file, { client, signal, onProgress }) };
  return { sourceUploadId: await uploadInChunks(file, { client, signal, onProgress }) };
};

// Every video type we take — the server converts them all to MP4.
export const VIDEO_ACCEPT = "video/*,.mp4,.m4v,.mov,.mkv,.webm,.avi,.wmv,.flv,.mpg,.mpeg,.3gp,.3g2,.ts,.mts,.m2ts,.ogv,.vob";
const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|webm|avi|wmv|flv|mpe?g|3gp|3g2|ts|mts|m2ts|ogv|vob)$/i;
export const isVideoFile = (file) => file.type.startsWith("video/") || VIDEO_EXT.test(file.name);
export const MAX_UPLOAD_GB = 50;
