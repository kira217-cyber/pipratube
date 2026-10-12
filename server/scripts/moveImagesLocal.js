// One-off: move every image that is still on Bunny into this server's
// uploads/ folder (videos stay on Bunny). Run with `npm run images:local`.
// Only files inside our own Bunny folder are deleted afterwards.
import "../config/env.js";
import mongoose from "mongoose";
import path from "node:path";

import connectDB from "../config/db.js";
import { deleteFromBunny } from "../config/bunnyStorage.js";
import { LOCAL_PREFIX, saveLocalImage } from "../utils/localFiles.js";

const FOLDER = (process.env.BUNNY_STORAGE_FOLDER || "PipraV2").replace(/^\/|\/$/g, "");

// collection → image fields on each document
const TARGETS = {
  videos: ["thumbnail"],
  channels: ["avatar", "banner"],
  users: ["avatar"],
  sitesettings: ["logo", "favicon"],
  ads: ["image"],
  livetvchannels: ["logo"],
  piprachannels: ["logo"],
};

const run = async () => {
  await connectDB();
  const db = mongoose.connection.db;
  let moved = 0;
  let failed = 0;

  for (const [collection, fields] of Object.entries(TARGETS)) {
    const docs = await db.collection(collection).find({ $or: fields.map((f) => ({ [`${f}.url`]: { $regex: "^https?://" } })) }).toArray();
    for (const doc of docs) {
      for (const field of fields) {
        const media = doc[field];
        if (!media?.url || !/^https?:\/\//.test(media.url) || media.fileName?.startsWith(LOCAL_PREFIX)) continue;
        try {
          const response = await fetch(media.url, { signal: AbortSignal.timeout(2 * 60 * 1000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = Buffer.from(await response.arrayBuffer());
          const ext = path.extname(new URL(media.url).pathname) || ".webp";
          const local = await saveLocalImage(buffer, field === "thumbnail" ? "thumb" : `${collection.replace(/s$/, "")}-${field}`, `image${ext}`);
          await db.collection(collection).updateOne({ _id: doc._id }, { $set: { [field]: local } });
          if (media.fileName && media.url.includes(`/${FOLDER}/`)) await deleteFromBunny(media.fileName);
          moved += 1;
        } catch (error) {
          failed += 1;
          console.error(`${collection} ${doc._id} ${field}: ${error.message}`);
        }
      }
    }
    console.log(`${collection}: done`);
  }

  console.log(`Moved ${moved} images to uploads/, ${failed} failed.`);
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
