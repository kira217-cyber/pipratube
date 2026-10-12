// Imported first in index.js so process.env is populated before any other
// module's top-level code runs (ES module imports evaluate in order).
//
// NODE_ENV=production (PM2: --env production) reads `.env.production` when it
// exists; otherwise `.env`. Paths are relative to the server folder, so it
// works whatever directory the process is started from.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const production = path.join(root, ".env.production");
const file = process.env.NODE_ENV === "production" && fs.existsSync(production) ? production : path.join(root, ".env");

dotenv.config({ path: file, quiet: true });
