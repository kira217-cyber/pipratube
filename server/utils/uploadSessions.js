import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// Resumable, chunked video uploads (YouTube-style). A big file arrives in
// fixed-size pieces, several at once and in any order, each written straight
// to its place in a temporary file on this server. If the connection drops,
// the browser asks which pieces arrived and sends only the rest. Once every
// piece is in, the file is handed to the video pipeline
// (utils/videoPipeline.js).

export const TMP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "tmp", "uploads");
fs.mkdirSync(TMP_DIR, { recursive: true });

export const CHUNK_BYTES = 8 * 1024 * 1024; // what the browser sends per request
export const maxUploadBytes = () => (Number(process.env.MAX_UPLOAD_GB) || 50) * 1024 ** 3;
const STALE_MS = 24 * 60 * 60 * 1000; // unfinished uploads are dropped after a day

const sessions = new Map(); // id → { owner, fileName, size, chunks, done, received, path, updatedAt, claimed }

export const chunkCount = (size) => Math.ceil(size / CHUNK_BYTES);

export const createSession = ({ owner, fileName, size }) => {
  const id = crypto.randomUUID();
  const file = path.join(TMP_DIR, `${id}.part`);
  // Full length up front, so each piece can be written at its own place.
  fs.writeFileSync(file, "");
  fs.truncateSync(file, size);
  const session = {
    id,
    owner,
    fileName: String(fileName || "video").slice(0, 200),
    size,
    chunks: chunkCount(size),
    done: new Set(), // indexes of the pieces already written
    received: 0, // bytes written
    path: file,
    updatedAt: Date.now(),
    claimed: false,
  };
  sessions.set(id, session);
  return session;
};

export const doneChunks = (session) => [...session.done].sort((a, b) => a - b);

export const getSession = (id, owner) => {
  const session = sessions.get(String(id || ""));
  return session && session.owner === owner ? session : null;
};

// Writes one piece at its place. A piece must start on a piece boundary and
// be exactly that piece's length, so a retried or duplicate piece simply
// overwrites itself with the same bytes.
export const writeChunk = async (session, offset, buffer) => {
  const index = offset / CHUNK_BYTES;
  const expected = Math.min(CHUNK_BYTES, session.size - offset);
  if (!Number.isInteger(index) || index < 0 || index >= session.chunks || buffer.length !== expected) {
    const error = new Error("This piece doesn't fit the file — please start the upload again");
    error.status = 400;
    throw error;
  }
  const handle = await fsp.open(session.path, "r+");
  try {
    await handle.write(buffer, 0, buffer.length, offset);
  } finally {
    await handle.close();
  }
  if (!session.done.has(index)) {
    session.done.add(index);
    session.received += buffer.length;
  }
  session.updatedAt = Date.now();
  return session.received;
};

// The finished file now belongs to a video; the session can go.
export const claimSession = (session) => {
  if (session.done.size !== session.chunks) return null;
  session.claimed = true;
  sessions.delete(session.id);
  return session.path;
};

export const dropSession = async (session) => {
  sessions.delete(session.id);
  await fsp.unlink(session.path).catch(() => {});
};

// Clean up abandoned uploads (and any stray temp files after a restart).
setInterval(async () => {
  const now = Date.now();
  for (const session of sessions.values()) if (now - session.updatedAt > STALE_MS) await dropSession(session);
  const live = new Set([...sessions.values()].map((s) => path.basename(s.path)));
  for (const name of await fsp.readdir(TMP_DIR).catch(() => [])) {
    if (!name.endsWith(".part") || live.has(name)) continue;
    const full = path.join(TMP_DIR, name);
    const stat = await fsp.stat(full).catch(() => null);
    if (stat && now - stat.mtimeMs > STALE_MS) await fsp.unlink(full).catch(() => {});
  }
}, 60 * 60 * 1000).unref();
