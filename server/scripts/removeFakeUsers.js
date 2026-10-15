// Removes the bot accounts (email at a fake domain — utils/fakeAccounts.js)
// and everything they left behind: empty channels, subscriptions, likes,
// comments, notifications, history, playlists, reports. An account that
// uploaded a video is never touched — it's listed for a person to look at.
//
//   NODE_ENV=production npm run users:remove-fake -- --dry   # only count
//   NODE_ENV=production npm run users:remove-fake            # remove
import "../config/env.js";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import { FAKE_EMAIL_DOMAIN } from "../utils/fakeAccounts.js";

const dry = process.argv.includes("--dry");
const BATCH = 2000;

await connectDB();
const db = mongoose.connection.db;
const users = db.collection("users");

const fakeIds = (await users.find({ email: { $regex: FAKE_EMAIL_DOMAIN } }).project({ _id: 1 }).toArray()).map((u) => u._id);
const uploaders = new Set((await db.collection("videos").distinct("owner", { owner: { $in: fakeIds } })).map(String));
const ids = fakeIds.filter((id) => !uploaders.has(String(id)));
console.log(`${fakeIds.length} accounts with fake email domains; ${uploaders.size} of them uploaded videos (kept, check by hand); ${ids.length} to remove${dry ? " — dry run, nothing changes" : ""}.`);
if (uploaders.size) console.log("Kept (have videos):", [...uploaders].join(", "));

// What they left behind (for the report).
const left = {
  subscriptions: await db.collection("subscriptions").countDocuments({ subscriber: { $in: ids } }),
  reactions: await db.collection("reactions").countDocuments({ user: { $in: ids } }),
  comments: await db.collection("comments").countDocuments({ user: { $in: ids } }),
  channels: await db.collection("channels").countDocuments({ owner: { $in: ids } }),
};
console.log("They left:", left);

if (!dry) {
  const totals = {};
  const add = (name, n) => {
    totals[name] = (totals[name] || 0) + n;
  };
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const channels = (await db.collection("channels").find({ owner: { $in: chunk } }).project({ _id: 1 }).toArray()).map((c) => c._id);

    // Take their subscriptions, likes and comments off the counters first.
    const subs = await db.collection("subscriptions").aggregate([{ $match: { subscriber: { $in: chunk } } }, { $group: { _id: "$channel", n: { $sum: 1 } } }]).toArray();
    for (const c of subs) await db.collection("channels").updateOne({ _id: c._id }, [{ $set: { subscriberCount: { $max: [0, { $subtract: ["$subscriberCount", c.n] }] } } }]);
    const votes = await db.collection("reactions").aggregate([{ $match: { user: { $in: chunk } } }, { $group: { _id: "$video", likes: { $sum: { $cond: [{ $eq: ["$value", 1] }, 1, 0] } }, dislikes: { $sum: { $cond: [{ $eq: ["$value", -1] }, 1, 0] } } } }]).toArray();
    for (const v of votes) {
      await db.collection("videos").updateOne({ _id: v._id }, [{ $set: { likes: { $max: [0, { $subtract: [{ $ifNull: ["$likes", 0] }, v.likes] }] }, dislikes: { $max: [0, { $subtract: [{ $ifNull: ["$dislikes", 0] }, v.dislikes] }] } } }]);
    }
    const said = await db.collection("comments").aggregate([{ $match: { user: { $in: chunk } } }, { $group: { _id: "$video", n: { $sum: 1 } } }]).toArray();
    for (const v of said) await db.collection("videos").updateOne({ _id: v._id }, [{ $set: { commentCount: { $max: [0, { $subtract: [{ $ifNull: ["$commentCount", 0] }, v.n] }] } } }]);

    const ops = [
      ["subscriptions", { $or: [{ subscriber: { $in: chunk } }, { channel: { $in: channels } }] }],
      ["reactions", { user: { $in: chunk } }],
      ["comments", { user: { $in: chunk } }],
      ["commentlikes", { user: { $in: chunk } }],
      ["notifications", { $or: [{ user: { $in: chunk } }, { actor: { $in: chunk } }] }],
      ["watchhistories", { user: { $in: chunk } }],
      ["playlists", { owner: { $in: chunk } }],
      ["reports", { reporter: { $in: chunk } }],
      ["channels", { _id: { $in: channels } }],
      ["users", { _id: { $in: chunk } }],
    ];
    for (const [name, filter] of ops) add(name, (await db.collection(name).deleteMany(filter)).deletedCount);
    console.log(`  removed ${Math.min(i + BATCH, ids.length)} / ${ids.length}`);
  }
  console.log("Removed:", totals);
}

await mongoose.disconnect();
process.exit(0);
