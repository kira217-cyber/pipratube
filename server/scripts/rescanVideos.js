// One-off: checks published videos again with the current adult-content
// rules (utils/moderation/rules.js). One that's flagged is taken down into
// "review" — exactly like a fresh upload — and its creator is notified; an
// admin then approves or rejects it. Videos an admin already approved,
// rejected or uploaded are left alone.
//
// Run it ON THE VPS (pictures of flagged frames are saved in uploads/):
//   NODE_ENV=production npm run videos:rescan                 # everything
//   NODE_ENV=production npm run videos:rescan -- --days 30    # last 30 days
//   NODE_ENV=production npm run videos:rescan -- --dry        # only report
import "../config/env.js";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import Video from "../models/Video.js";
import { checkVideoSource } from "../utils/moderation/check.js";
import { recheckVideo } from "../utils/moderation/flow.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const daysAt = args.indexOf("--days");
const days = daysAt >= 0 ? Number(args[daysAt + 1]) : 0;

await connectDB();
const filter = {
  status: "published",
  "moderation.status": { $nin: ["approved", "rejected", "exempt"] },
  ...(days > 0 ? { createdAt: { $gt: new Date(Date.now() - days * 86400e3) } } : {}),
};
const ids = (await Video.find(filter).sort({ createdAt: -1 }).select("_id").lean()).map((v) => v._id);
console.log(`${ids.length} published videos to check${dry ? " (dry run — nothing changes)" : ""}`);

let held = 0;
let failed = 0;
for (const [index, id] of ids.entries()) {
  const video = await Video.findById(id).select("title durationSeconds file").lean();
  const label = `[${index + 1}/${ids.length}] ${video.title.replace(/\s+/g, " ").slice(0, 60)}`;
  try {
    if (dry) {
      const source = video.file?.fallbackUrl || video.file?.url;
      const result = await checkVideoSource(source, video.durationSeconds || 60);
      if (result.verdict === "flagged") held += 1;
      console.log(`${result.verdict === "flagged" ? "FLAGGED" : "clean  "} ${result.adultFrames}/${result.checked}  ${label}`);
    } else {
      await recheckVideo(id);
      const after = await Video.findById(id).select("status moderation.server.state").lean();
      if (after.status === "review") held += 1;
      if (after.moderation?.server?.state === "error") failed += 1;
      console.log(`${after.status === "review" ? "HELD   " : after.moderation?.server?.state === "error" ? "ERROR  " : "clean  "} ${label}`);
    }
  } catch (error) {
    failed += 1;
    console.log(`ERROR   ${label}: ${error.message}`);
  }
}
console.log(`\nDone: ${held} ${dry ? "would be held" : "held for review"}, ${failed} couldn't be read, ${ids.length - held - failed} clean.`);
await mongoose.disconnect();
process.exit(0);
