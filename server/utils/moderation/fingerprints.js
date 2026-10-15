import Video from "../../models/Video.js";
import { hashDistance } from "./rules.js";

// Fingerprints of videos an admin rejected as pornographic. A new upload
// whose frames match one of them is the same video coming back (re-encoded,
// resized or renamed), so it's held for review at once — before anyone can
// watch it.

const CLOSE = 6; // differing bits (of 64) that still count as the same picture
const HASH = /^[0-9a-f]{16}$/;

let banned = null;

const load = async () => {
  if (!banned) {
    banned = (async () => {
      const rows = await Video.find({ "moderation.status": "rejected", "moderation.fingerprints.0": { $exists: true } })
        .select("moderation.fingerprints")
        .lean();
      return rows.map((r) => ({ id: String(r._id), hashes: r.moderation.fingerprints }));
    })().catch((error) => {
      banned = null;
      throw error;
    });
  }
  return banned;
};

// Call after a video is rejected (or un-rejected).
export const forgetBannedFingerprints = () => {
  banned = null;
};

export const cleanHashes = (list) => (Array.isArray(list) ? list.filter((h) => typeof h === "string" && HASH.test(h)).slice(0, 150) : []);

// The rejected video `hashes` matches, or null. A match needs at least 3
// frames (and a quarter of the frames) to look like the rejected video's.
export const matchBanned = async (hashes, { except } = {}) => {
  const mine = cleanHashes(hashes);
  if (mine.length < 3) return null;
  const need = Math.max(3, Math.ceil(mine.length * 0.25));
  for (const video of await load()) {
    if (video.id === String(except)) continue;
    let same = 0;
    for (const h of mine) {
      if (video.hashes.some((b) => hashDistance(h, b) <= CLOSE)) same += 1;
      if (same >= need) return video.id;
    }
  }
  return null;
};
