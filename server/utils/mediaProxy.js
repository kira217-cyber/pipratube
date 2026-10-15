import http from "node:http";
import crypto from "node:crypto";
import { Readable } from "node:stream";

// ffmpeg reads videos on the CDN through this tiny local relay instead of
// fetching them itself. The npm ffmpeg is a fully static build, and on Linux
// servers a static build can hang or fail looking up the CDN's host name or
// opening HTTPS — Node does both reliably. ffmpeg gets a plain
// http://127.0.0.1 address; this relay fetches the real URL (with our
// Referer, which the CDN asks for) and passes byte ranges straight through,
// so seeking still downloads only the bits needed.
//
// It listens on 127.0.0.1 only, on a random port, behind a random key — and
// is started on first use, in whichever process needs it (the API or a script).

const SITE_URL = () => (process.env.SITE_URL || "https://pipratube.com").replace(/\/$/, "");
const KEY = crypto.randomBytes(16).toString("hex");
const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

let listening = null;

const start = () => {
  if (!listening) {
    listening = new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, "http://127.0.0.1");
        const target = url.searchParams.get("u") || "";
        if (url.pathname !== `/${KEY}` || !/^https?:\/\//.test(target) || !["GET", "HEAD"].includes(req.method)) {
          res.writeHead(403).end();
          return;
        }
        const controller = new AbortController();
        res.on("close", () => controller.abort());
        try {
          const headers = { Referer: `${SITE_URL()}/` };
          if (req.headers.range) headers.Range = req.headers.range;
          const upstream = await fetch(target, { method: req.method, headers, signal: controller.signal });
          const out = {};
          PASS_HEADERS.forEach((name) => {
            const value = upstream.headers.get(name);
            if (value) out[name] = value;
          });
          res.writeHead(upstream.status, out);
          if (!upstream.body || req.method === "HEAD") {
            res.end();
            return;
          }
          Readable.fromWeb(upstream.body).on("error", () => res.destroy()).pipe(res);
        } catch {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        }
      });
      server.on("error", (error) => {
        listening = null;
        reject(error);
      });
      server.listen(0, "127.0.0.1", () => {
        server.unref(); // never keeps a script running on its own
        resolve(server.address().port);
      });
    });
  }
  return listening;
};

// The address ffmpeg should open for `source`: local files as they are,
// web addresses through the relay.
export const ffmpegInput = async (source) => {
  if (!/^https?:\/\//.test(String(source))) return source;
  const port = await start();
  return `http://127.0.0.1:${port}/${KEY}?u=${encodeURIComponent(source)}`;
};

export default ffmpegInput;
