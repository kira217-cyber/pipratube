// Copies videos whose file still lives outside our Bunny folder (the ones
// imported from the old site) into BUNNY_STORAGE_FOLDER (PipraV2), then
// points the video at the copy. The old site's file is only read — never
// changed or deleted.
//
//   npm run videos:copy -- --max-gb=3        smallest first, up to 3 GB
//   npm run videos:copy -- --ids=a,b,c       just these videos
//   npm run videos:copy -- --dry             list what would be copied
//   npm run videos:copy -- --hide-rest       hide every video not yet in the
//                                            folder (copying it later shows it again)
import "../config/env.js";
import https from "node:https";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import { uploadStreamToBunny, getBunnyCdnUrl } from "../config/bunnyStorage.js";
import { buildBunnyFileName } from "../utils/files.js";

const FOLDER = (process.env.BUNNY_STORAGE_FOLDER || "PipraV2").replace(/^\/|\/$/g, "");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}`))?.split("=")[1];
const DRY = process.argv.includes("--dry");
const MAX_BYTES = Number(arg("max-gb") || 0) * 1024 ** 3;
const IDS = arg("ids")?.split(",").filter(Boolean);
const HIDE_REST = process.argv.includes("--hide-rest");
// Reason shown in admin for videos hidden until their file is copied.
const WAITING = `Waiting to be copied to ${FOLDER}`;

const head = (url) => fetch(url, { method: "HEAD" }).then((r) => Number(r.headers.get("content-length")) || 0);

const download = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`download HTTP ${res.statusCode}`));
        } else resolve(res);
      })
      .on("error", reject);
  });

const mb = (bytes) => `${(bytes / 1048576).toFixed(0)} MB`;

const run = async () => {
  await connectDB();
  const videos = mongoose.connection.db.collection("videos");
  const filter = { "file.url": { $not: new RegExp(`/${FOLDER}/`) } };
  if (IDS) filter._id = { $in: IDS.map((id) => new mongoose.Types.ObjectId(id)) };
  const list = await videos.find(filter).project({ title: 1, file: 1, status: 1, removedReason: 1 }).toArray();

  if (HIDE_REST) {
    const ids = list.filter((v) => v.status === "published").map((v) => v._id);
    const result = await videos.updateMany({ _id: { $in: ids } }, { $set: { status: "removed", removedReason: WAITING } });
    console.log(`Hid ${result.modifiedCount} videos whose files are not in ${FOLDER} yet.`);
    await mongoose.disconnect();
    return;
  }

  const sized = [];
  for (const video of list) sized.push({ video, bytes: await head(video.file.url) });
  sized.sort((a, b) => a.bytes - b.bytes);

  let budget = 0;
  const picked = sized.filter(({ bytes }) => {
    if (!MAX_BYTES || IDS) return true;
    if (budget + bytes > MAX_BYTES) return false;
    budget += bytes;
    return true;
  });
  console.log(`${picked.length} of ${sized.length} videos, ${mb(picked.reduce((n, p) => n + p.bytes, 0))}`);

  for (const { video, bytes } of picked) {
    console.log(`→ ${mb(bytes).padStart(8)}  ${video.title.slice(0, 60)}`);
    if (DRY || !bytes) continue;
    const started = Date.now();
    try {
      const fileName = buildBunnyFileName("video", "video.mp4");
      const source = await download(video.file.url);
      let last = -10;
      await uploadStreamToBunny(source, fileName, "video/mp4", bytes, (percent) => {
        if (percent - last >= 10) {
          last = percent;
          process.stdout.write(`   ${percent.toFixed(0)}%`);
        }
      });
      const url = getBunnyCdnUrl(fileName);
      const check = await head(url);
      if (check !== bytes) throw new Error(`size check failed (${check} vs ${bytes})`);
      const set = { "file.url": url, "file.fileName": fileName, "file.provider": "storage" };
      // Hidden only because it wasn't copied yet → show it again.
      if (video.status === "removed" && video.removedReason === WAITING) Object.assign(set, { status: "published", removedReason: null });
      await videos.updateOne({ _id: video._id }, { $set: set });
      const seconds = (Date.now() - started) / 1000;
      console.log(`\n   done in ${seconds.toFixed(0)}s (${(bytes / 1048576 / seconds).toFixed(1)} MB/s)`);
    } catch (error) {
      console.log(`\n   FAILED: ${error.message}`);
    }
  }
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
