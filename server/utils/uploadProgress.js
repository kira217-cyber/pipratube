// In-memory store for large-file (Bunny) upload progress, keyed by a
// client-generated uploadId — lets the browser poll a lightweight GET
// endpoint for a live percentage while the real upload POST/PUT is still
// in flight, since that single request only resolves once the whole
// client -> server -> Bunny relay finishes.
const progressStore = new Map();

const STALE_MS = 5 * 60 * 1000;

export const setUploadProgress = (uploadId, percent) => {
  if (!uploadId) return;
  progressStore.set(uploadId, { percent, updatedAt: Date.now() });
};

export const getUploadProgress = (uploadId) => {
  const entry = progressStore.get(uploadId);
  return entry ? entry.percent : null;
};

export const clearUploadProgress = (uploadId) => {
  if (uploadId) progressStore.delete(uploadId);
};

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of progressStore.entries()) {
    if (now - entry.updatedAt > STALE_MS) progressStore.delete(id);
  }
}, 60 * 1000).unref();
