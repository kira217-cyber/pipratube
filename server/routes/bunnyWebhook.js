import express from "express";

import { syncStreamByGuid } from "../utils/streamVideos.js";

// POST /api/bunny/stream-webhook — Bunny Stream calls this whenever a video's
// status changes (set in the library's Webhook settings). The body is only
// a hint: we read the real status back from Bunny with our own key, so a
// forged call can't publish anything.
const router = express.Router();

router.post("/stream-webhook", (req, res) => {
  const { VideoLibraryId, VideoGuid } = req.body || {};
  res.json({ ok: true });
  if (String(VideoLibraryId) !== String(process.env.BUNNY_STREAM_LIBRARY_ID) || !VideoGuid) return;
  syncStreamByGuid(VideoGuid).catch((error) => console.error("Stream webhook sync failed:", error.message));
});

export default router;
