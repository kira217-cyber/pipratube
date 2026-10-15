import Video from "../../models/Video.js";
import Channel from "../../models/Channel.js";
import User from "../../models/User.js";
import { notifySubscribers, notifyUser } from "../notify.js";
import { checkVideoSource } from "./check.js";
import { cleanHashes, forgetBannedFingerprints, matchBanned } from "./fingerprints.js";

// What happens to an upload once its file is ready, and to the creator when
// a video turns out to be pornographic:
//
//   ready ─┬─ the browser's check said "flagged" ─────────► review (hidden)
//          ├─ the browser's check said "clean"  ─► published, then the
//          │                                       server checks again
//          └─ no browser check (e.g. AVI), or  ─► "checking": published
//             an account with a strike             only after the server check
//
//   frames match a video an admin rejected before ─► review at once
//   3 signed-in viewers report it as sexual        ─► review (hidden)
//
//   server check "flagged" ─► review (taken down if it was already live)
//   admin Approve          ─► published with the creator's own visibility
//   admin Reject           ─► removed + one strike; 3 strikes block the account
//
// Strikes come only from an admin's Reject, never from the AI alone. A video
// the creator deletes while under review stays on record, so it can still be
// rejected.

export const STRIKES_TO_BLOCK = 3;

const syncChannelCounts = async (channelId) => {
  const [videoCount, viewsAgg] = await Promise.all([
    Video.countDocuments({ channel: channelId, status: "published" }),
    Video.aggregate([{ $match: { channel: channelId } }, { $group: { _id: null, views: { $sum: "$views" } } }]),
  ]);
  await Channel.updateOne({ _id: channelId }, { videoCount, totalViews: viewsAgg[0]?.views || 0 });
};

const REASON = "Our automatic check found sexual / adult content in this video. Adult content isn't allowed on PipraTube, so it isn't public. Our team will review it.";
const REPEAT_REASON = "This video matches a video that was removed from PipraTube for adult content, so it isn't public. Our team will review it.";
const UNCHECKED_REASON = "We couldn't check this video automatically, so our team will look at it before it goes public.";
const REPORTS_REASON = "Several viewers reported this video for sexual content, so it's hidden until our team reviews it.";

// The browser's verdict, as sent with the upload (a JSON string).
export const parseClientCheck = (raw) => {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || !["clean", "flagged"].includes(data.verdict)) return null;
  const num = (v) => Math.max(0, Math.min(1000, Number(v) || 0));
  return {
    verdict: data.verdict,
    adultFrames: num(data.adultFrames),
    peak: num(data.peak),
    checked: num(data.checked),
    checkedAt: new Date(),
    frames: (Array.isArray(data.frames) ? data.frames : []).slice(0, 12).map((f) => ({ t: num(f.t), scores: f.scores || {} })),
    hashes: cleanHashes(data.hashes),
  };
};

// ---------- publishing ----------

export const publishVideo = async (video) => {
  const wasScheduled = video.publishedAt > new Date();
  if (!wasScheduled) video.publishedAt = new Date();
  video.status = "published";
  video.processing.stage = "done";
  video.processing.percent = 100;
  video.processing.error = null;
  await video.save();
  await syncChannelCounts(video.channel);
  if (video.visibility === "public" && !wasScheduled) {
    const channel = await Channel.findById(video.channel);
    if (channel) notifySubscribers(channel, video);
  }
};

export const holdForReview = async (video, flaggedBy, reason = REASON) => {
  const wasLive = video.status === "published";
  video.status = "review";
  video.processing.stage = "done";
  video.processing.percent = 100;
  video.moderation.status = "flagged";
  video.moderation.flaggedBy = flaggedBy;
  video.moderation.flaggedAt = new Date();
  video.moderation.reason = reason;
  await video.save();
  if (wasLive) await syncChannelCounts(video.channel);
  const why = {
    fingerprint: "it matches a video removed for adult content",
    reports: "viewers reported sexual content",
    unchecked: "it couldn't be checked automatically",
  }[flaggedBy] || "adult content was found";
  notifyUser({
    user: video.owner,
    type: "video_review",
    channel: video.channel,
    video: video._id,
    text: `"${video.title.slice(0, 80)}" is under review: ${why}, so it isn't public.`,
  });
};

// Called by both upload pipelines the moment the video file is ready.
export const releaseWhenChecked = async (video) => {
  const status = video.moderation?.status;
  if (status === "exempt") return publishVideo(video);
  if (await matchBanned(video.moderation?.fingerprints, { except: video._id })) {
    await holdForReview(video, "fingerprint", REPEAT_REASON);
    queueServerCheck(video._id);
    return undefined;
  }
  if (video.moderation?.client?.verdict === "flagged") {
    await holdForReview(video, "browser");
    queueServerCheck(video._id);
    return undefined;
  }
  // An account that already had a video removed doesn't get the benefit of
  // the doubt: its uploads wait for the server's own check.
  const owner = await User.findById(video.owner).select("strikes").lean();
  if (video.moderation?.client?.verdict === "clean" && !(owner?.strikes > 0)) {
    video.moderation.status = "clean";
    await publishVideo(video);
    queueServerCheck(video._id);
    return undefined;
  }
  // No browser check (a format the browser can't play): wait for ours.
  video.moderation.status = "pending";
  video.processing.stage = "checking";
  video.processing.percent = 100;
  await video.save();
  queueServerCheck(video._id, { first: true });
  return undefined;
};

// ---------- the server's check (one at a time) ----------

const queue = [];
let running = false;

const runServerCheck = async (videoId) => {
  const video = await Video.findById(videoId);
  if (!video || video.moderation?.status === "exempt" || ["removed", "failed"].includes(video.status)) return;
  const source = video.file?.fallbackUrl || video.file?.url;
  if (!source) return;
  video.moderation.server.state = "running";
  video.moderation.server.error = null;
  await video.save();

  let result = null;
  try {
    result = await checkVideoSource(source, video.durationSeconds || 60);
  } catch (error) {
    console.error(`Adult-content check failed for ${videoId}:`, error.message);
  }

  const fresh = await Video.findById(videoId);
  if (!fresh) return;
  if (!result) {
    fresh.moderation.server.state = "error";
    fresh.moderation.server.error = "Couldn't read the video";
    // Nobody could check it (no browser check, or the account has a strike):
    // an admin decides rather than letting it out unchecked.
    if (fresh.status === "processing" && fresh.processing.stage === "checking") {
      await holdForReview(fresh, "unchecked", UNCHECKED_REASON);
    } else await fresh.save();
    return;
  }

  fresh.moderation.server = {
    state: "done",
    verdict: result.verdict,
    adultFrames: result.adultFrames,
    peak: result.peak,
    checked: result.checked,
    checkedAt: new Date(),
    error: null,
  };
  result.evidence.forEach((e) => fresh.moderation.evidence.push({ t: e.t, image: e.image || {}, scores: e.scores, source: "server" }));

  if (result.hashes.length) fresh.moderation.fingerprints = result.hashes;
  const decided = ["approved", "rejected"].includes(fresh.moderation.status);
  const repeat = !decided && fresh.moderation.flaggedBy !== "fingerprint" && Boolean(await matchBanned(result.hashes, { except: fresh._id }));
  if (repeat && fresh.status !== "review") {
    await holdForReview(fresh, "fingerprint", REPEAT_REASON);
  } else if (result.verdict === "flagged" && !decided && fresh.status !== "review") {
    await holdForReview(fresh, "server");
  } else if (result.verdict === "clean" && !repeat && !decided && fresh.status === "review" && fresh.moderation.flaggedBy === "browser" && !fresh.moderation.deletedByOwner) {
    // Only the upload-time check flagged it and the server's own check finds
    // it clean: the server has the final word — let it out.
    fresh.moderation.status = "clean";
    await publishVideo(fresh);
    notifyUser({ user: fresh.owner, type: "video_approved", channel: fresh.channel, video: fresh._id, text: `"${fresh.title.slice(0, 80)}" passed review and is now available.` });
  } else if (result.verdict === "clean" && fresh.status === "processing" && fresh.processing.stage === "checking") {
    fresh.moderation.status = "clean";
    await publishVideo(fresh);
  } else {
    await fresh.save();
  }
};

// Checks one video again now (scripts/rescanVideos.js): a live video that's
// flagged goes into review, like a fresh upload.
export const recheckVideo = (videoId) => runServerCheck(videoId);

const pump = async () => {
  if (running) return;
  running = true;
  while (queue.length) {
    const id = queue.shift();
    await runServerCheck(id).catch((error) => console.error("Adult-content check:", error.message));
  }
  running = false;
};

// `first`: a video that can't go out until this check is done skips ahead
// of the background re-checks of videos that are already live.
export const queueServerCheck = (videoId, { first = false } = {}) => {
  const id = String(videoId);
  if (queue.includes(id)) return;
  if (first) queue.unshift(id);
  else queue.push(id);
  // Remembered in the database, so a restart picks it up again.
  Video.updateOne({ _id: id }, { "moderation.server.state": "queued" })
    .catch(() => {})
    .finally(pump);
};

// After a restart: finish the checks that were waiting.
export const resumeServerChecks = async () => {
  const waiting = await Video.find({ "moderation.server.state": { $in: ["queued", "running"] } }).select("_id").limit(500).lean();
  const pending = await Video.find({ status: "processing", "processing.stage": "checking" }).select("_id").limit(500).lean();
  pending.forEach((v) => queueServerCheck(v._id, { first: true }));
  waiting.forEach((v) => queueServerCheck(v._id));
};

// ---------- the admin's decision ----------

export const approveVideo = async (video, adminId) => {
  if (video.moderation.status === "rejected") forgetBannedFingerprints();
  video.moderation.status = "approved";
  video.moderation.reviewedBy = adminId;
  video.moderation.reviewedAt = new Date();
  if (video.status === "review") await publishVideo(video);
  else await video.save();
  notifyUser({ user: video.owner, type: "video_approved", channel: video.channel, video: video._id, text: `"${video.title.slice(0, 80)}" passed review and is now available.` });
};

// Removes the video's file, gives its owner a strike and blocks the account
// at the third. `removeFile` deletes the stored media (config/uploads.js).
export const rejectVideo = async (video, adminId, note, removeFile) => {
  video.moderation.status = "rejected";
  video.moderation.reviewedBy = adminId;
  video.moderation.reviewedAt = new Date();
  video.moderation.note = String(note || "").slice(0, 300);
  video.status = "removed";
  video.removedReason = "Adult / sexual content";
  await video.save();
  await syncChannelCounts(video.channel);
  // Its fingerprints stop the same video coming back. Taken from the file
  // first when the checks didn't leave any, then the file is deleted.
  fingerprintThenRemove(video, removeFile).catch(() => {});

  const user = await User.findById(video.owner);
  if (!user) return { strikes: 0, blocked: false };
  user.strikes = (user.strikes || 0) + 1;
  const blocked = user.strikes >= STRIKES_TO_BLOCK && user.status !== "blocked";
  if (blocked) {
    user.status = "blocked";
    user.tokenVersion = (user.tokenVersion || 0) + 1; // signs them out everywhere
  }
  await user.save();
  notifyUser({
    user: user._id,
    type: "video_rejected",
    channel: video.channel,
    video: video._id,
    text: `"${video.title.slice(0, 80)}" was removed for adult content. Strike ${Math.min(user.strikes, STRIKES_TO_BLOCK)} of ${STRIKES_TO_BLOCK}.`,
  });
  if (blocked) notifyUser({ user: user._id, type: "account_blocked", text: `Your account was blocked after ${STRIKES_TO_BLOCK} videos were removed for adult content.` });
  return { strikes: user.strikes, blocked };
};

const fingerprintThenRemove = async (video, removeFile) => {
  const source = video.file?.fallbackUrl || video.file?.url;
  if (!video.moderation.fingerprints?.length && source) {
    const result = await checkVideoSource(source, video.durationSeconds || 60).catch(() => null);
    if (result?.hashes?.length) await Video.updateOne({ _id: video._id }, { "moderation.fingerprints": result.hashes });
  }
  forgetBannedFingerprints();
  if (video.file?.fileName) removeFile(video.file.fileName);
};

// Viewers' reports: once 3 different signed-in viewers report a live video
// for sexual content (or child abuse), it's hidden until an admin looks.
// A video an admin already approved stays up — the reports still reach
// the Reports page.
export const REPORTS_TO_HOLD = 3;
export const holdIfReported = async (video, reporters) => {
  if (reporters < REPORTS_TO_HOLD || video.status !== "published") return false;
  if (["approved", "exempt"].includes(video.moderation?.status)) return false;
  await holdForReview(video, "reports", REPORTS_REASON);
  return true;
};

// The creator deleting a video that's under review: it disappears for them,
// but the record (and its evidence) stays for the admin's decision.
export const deleteUnderReview = async (video, removeFile) => {
  video.moderation.deletedByOwner = true;
  video.status = "removed";
  video.removedReason = "Deleted by the creator during review";
  if (video.file?.fileName) removeFile(video.file.fileName);
  await video.save();
  await syncChannelCounts(video.channel);
};
