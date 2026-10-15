import express from "express";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { UPLOAD_DIR } from "../utils/localFiles.js";

// GET /api/img/:width/images/:name — a stored image at a card's size.
// Thumbnails are saved up to 1080×1920, but a card shows ~250–450px; sending
// the full picture made rows heavy to scroll. Each size is made once with
// sharp and kept in uploads/resized, then served with a long cache.

const router = express.Router();
const WIDTHS = new Set([160, 240, 360, 480, 720, 1280]);
const SOURCE_DIR = path.join(UPLOAD_DIR, "images");
const making = new Map(); // file → promise, so one size is made once at a time

router.get("/:width/images/:name", async (req, res) => {
  const width = Number(req.params.width);
  const name = path.basename(req.params.name);
  if (!WIDTHS.has(width) || name !== req.params.name) return res.status(404).end();

  const source = path.join(SOURCE_DIR, name);
  const out = path.join(UPLOAD_DIR, "resized", String(width), name.replace(/\.[^.]+$/, ".webp"));
  try {
    if (!fs.existsSync(out)) {
      if (!fs.existsSync(source)) return res.status(404).end();
      if (!making.has(out)) {
        making.set(
          out,
          (async () => {
            await fs.promises.mkdir(path.dirname(out), { recursive: true });
            await sharp(source, { failOn: "none" })
              .rotate()
              .resize({ width, withoutEnlargement: true })
              .webp({ quality: 78, effort: 3 })
              .toFile(`${out}.tmp`);
            await fs.promises.rename(`${out}.tmp`, out);
          })().finally(() => making.delete(out)),
        );
      }
      await making.get(out);
    }
    res.set("Cache-Control", "public, max-age=2592000, immutable");
    return res.type("image/webp").sendFile(out);
  } catch {
    // Fall back to the original picture.
    return fs.existsSync(source) ? res.sendFile(source) : res.status(404).end();
  }
});

export default router;
