import express from "express";

import { requireUploader } from "../middleware/auth.js";
import { CHUNK_BYTES, createSession, doneChunks, getSession, maxUploadBytes, writeChunk } from "../utils/uploadSessions.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { streamEnabled } from "../utils/bunnyStream.js";
import { openStreamUpload } from "../utils/streamVideos.js";

// Resumable video uploads (see utils/uploadSessions.js):
//   POST /api/uploads              { fileName, size }   → { uploadId, chunkSize }
//   GET  /api/uploads/:id                                → { received, size, done: [piece indexes] }
//   PUT  /api/uploads/:id?offset=N  (raw bytes of one piece) → { received }
// Pieces may arrive in parallel and in any order. The finished upload is
// then attached to a video with its uploadId.
const router = express.Router();
router.use(requireUploader);

// Which way uploads go: straight to Bunny Stream when it's set up, or in
// pieces through this server (the older path) when it isn't.
router.get("/mode", (req, res) => successResponse(res, "Upload mode", { mode: streamEnabled() ? "stream" : "chunks" }));

// POST /api/uploads/stream { fileName, size } → a signed ticket the browser
// uses to upload the file straight to Bunny Stream (TUS, resumable).
router.post("/stream", async (req, res) => {
  try {
    const ticket = await openStreamUpload({ uploader: req.uploader, fileName: req.body?.fileName, size: req.body?.size });
    return successResponse(res, "Upload ready", ticket, 201);
  } catch (error) {
    return errorResponse(res, error.message, error.status || 500);
  }
});

router.post("/", (req, res) => {
  const size = Number(req.body?.size);
  if (!Number.isFinite(size) || size <= 0) return errorResponse(res, "Choose a video file", 400);
  const limit = maxUploadBytes();
  if (size > limit) return errorResponse(res, `Videos can be up to ${Math.round(limit / 1024 ** 3)} GB`, 413);
  const session = createSession({ owner: req.uploader, fileName: req.body?.fileName, size });
  return successResponse(res, "Upload started", { uploadId: session.id, chunkSize: CHUNK_BYTES, received: 0, size }, 201);
});

router.get("/:id", (req, res) => {
  const session = getSession(req.params.id, req.uploader);
  if (!session) return errorResponse(res, "This upload has expired — please start again", 404);
  return successResponse(res, "Upload", { received: session.received, size: session.size, done: doneChunks(session) });
});

router.put("/:id", express.raw({ type: () => true, limit: CHUNK_BYTES + 1024 * 1024 }), async (req, res) => {
  const session = getSession(req.params.id, req.uploader);
  if (!session) return errorResponse(res, "This upload has expired — please start again", 404);
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return errorResponse(res, "Empty chunk", 400);
  try {
    const received = await writeChunk(session, Number(req.query.offset), req.body);
    return successResponse(res, "Chunk saved", { received, size: session.size });
  } catch (error) {
    return errorResponse(res, error.message, error.status || 500);
  }
});

export default router;
