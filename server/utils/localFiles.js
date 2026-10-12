import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildBunnyFileName } from "./files.js";

// Images (thumbnails, avatars, banners, logos, ad banners) live on the API
// server itself under /uploads; only videos go to Bunny. The database keeps
// the path ("/uploads/images/…") and `publicUrl` puts the API's own address
// in front when it's read, so moving the API to another domain needs no
// database changes.

export const UPLOAD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads");
const IMAGE_DIR = path.join(UPLOAD_DIR, "images");
fs.mkdirSync(IMAGE_DIR, { recursive: true });

// Marks a stored file as local, so deleting it never reaches Bunny.
export const LOCAL_PREFIX = "local:";

export const apiBaseUrl = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5100}`).replace(/\/$/, "");

export const publicUrl = (value) => (typeof value === "string" && value.startsWith("/uploads/") ? `${apiBaseUrl()}${value}` : value);

export const saveLocalImage = async (buffer, prefix, originalName = "image.jpg") => {
  const name = buildBunnyFileName(prefix, originalName).split("/").pop();
  await fsp.writeFile(path.join(IMAGE_DIR, name), buffer);
  return { url: `/uploads/images/${name}`, fileName: `${LOCAL_PREFIX}images/${name}` };
};

export const removeLocal = async (fileName) => {
  const relative = fileName.slice(LOCAL_PREFIX.length);
  const target = path.resolve(UPLOAD_DIR, relative);
  if (!target.startsWith(UPLOAD_DIR + path.sep)) return; // never outside uploads/
  await fsp.unlink(target).catch(() => {});
};
