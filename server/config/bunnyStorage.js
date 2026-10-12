// Bunny.net Edge Storage integration for raw video/trailer files.
// The AccessKey lives only in server env vars and is never sent to clients.
//
// Env vars are read lazily (inside functions) rather than cached at module
// load time: ES module imports are hoisted and run before index.js's
// dotenv.config() call, so top-level `process.env.X` reads here would
// always see undefined.
import https from "https";

const config = () => ({
  storageHost: process.env.BUNNY_STORAGE_HOST || "sg.storage.bunnycdn.com",
  storageZone: process.env.BUNNY_STORAGE_ZONE || "oracle-store",
  storageFolder: process.env.BUNNY_STORAGE_FOLDER || "PipraV2",
  cdnHostname: process.env.BUNNY_CDN_HOSTNAME || "oracle-store.b-cdn.net",
  accessKey: process.env.BUNNY_STORAGE_ACCESS_KEY,
});

// Each path segment is encoded separately — encoding the whole URL at once
// would double-encode the already-safe zone/folder segments.
const buildStorageUrl = (fileName) => {
  const { storageHost, storageZone, storageFolder } = config();
  return `https://${storageHost}/${encodeURIComponent(storageZone)}/${encodeURIComponent(storageFolder)}/${encodeURIComponent(fileName)}`;
};

export const getBunnyCdnUrl = (fileName) => {
  const { cdnHostname, storageFolder } = config();
  return `https://${cdnHostname}/${encodeURIComponent(storageFolder)}/${encodeURIComponent(fileName)}`;
};

// `onProgress(percent)` is optional — passed by upload routes that want to
// relay live progress to a polling client (see server/utils/uploadProgress.js).
//
// Uploads via raw `https.request` in fixed-size chunks, waiting for the
// socket's `drain` event before writing the next one, rather than handing
// the whole buffer to a single `write()`/fetch body. Node buffers a large
// write internally and reports it "sent" almost instantly regardless of
// real network throughput (confirmed: axios/fetch progress on a Buffer body
// fired 0% then 100% within ~70ms even for a 300MB upload that took over a
// minute to actually finish) — `drain` only fires once the kernel socket
// buffer has actually flushed, so pacing chunks off it reflects genuine
// upload progress instead of a false-positive instant 100%.
export const uploadToBunny = (buffer, fileName, contentType, onProgress) =>
  new Promise((resolve, reject) => {
    const { accessKey } = config();

    if (!accessKey) {
      reject(
        new Error(
          "Bunny storage is not configured (missing BUNNY_STORAGE_ACCESS_KEY)",
        ),
      );
      return;
    }

    const target = new URL(buildStorageUrl(fileName));
    const CHUNK_SIZE = 1024 * 1024; // 1MB

    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "PUT",
        headers: {
          AccessKey: accessKey,
          "Content-Type": contentType || "application/octet-stream",
          "Content-Length": buffer.length,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            onProgress?.(100);
            resolve(getBunnyCdnUrl(fileName));
          } else {
            reject(
              new Error(
                `Bunny storage upload failed (${res.statusCode}): ${body || res.statusMessage}`,
              ),
            );
          }
        });
      },
    );

    req.on("error", (error) =>
      reject(new Error(`Bunny storage upload failed: ${error.message}`)),
    );

    let offset = 0;

    const writeNextChunk = () => {
      if (offset >= buffer.length) {
        req.end();
        return;
      }

      const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, buffer.length));
      offset += chunk.length;

      const ok = req.write(chunk);
      onProgress?.(Math.min(99, Math.round((offset / buffer.length) * 100)));

      if (ok) {
        setImmediate(writeNextChunk);
      } else {
        req.once("drain", writeNextChunk);
      }
    };

    if (buffer.length === 0) {
      req.end();
    } else {
      writeNextChunk();
    }
  });

// Streams a file straight through to Bunny instead of waiting for the whole
// thing to arrive first.
//
// The buffered `uploadToBunny` above can only start once the browser has
// finished sending, so an upload costs the client -> server time *plus* the
// server -> Bunny time, one after the other. Piping the incoming request
// body directly into the Bunny request overlaps them: the file lands in
// storage moments after the last byte leaves the browser, roughly halving
// the wait, and there is only ever one progress figure to report instead of
// two legs at different speeds.
//
// `contentLength` must be the exact byte count — Bunny needs it up front,
// and Node will otherwise sit waiting for bytes that never come. Callers
// take it from the browser's own File.size, and a mismatch is caught here
// rather than left to hang.
//
// Backpressure is honoured by pausing the source whenever the socket is
// full, so progress tracks what Bunny has actually accepted rather than
// what Node has buffered.
export const uploadStreamToBunny = (
  source,
  fileName,
  contentType,
  contentLength,
  onProgress,
) =>
  new Promise((resolve, reject) => {
    const { accessKey } = config();

    if (!accessKey) {
      reject(
        new Error(
          "Bunny storage is not configured (missing BUNNY_STORAGE_ACCESS_KEY)",
        ),
      );
      return;
    }

    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      reject(new Error("A valid file size is required to stream to storage"));
      return;
    }

    const target = new URL(buildStorageUrl(fileName));

    let sent = 0;
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      source.removeListener("data", onData);
      source.removeListener("end", onEnd);
      source.removeListener("error", onSourceError);
      if (error) reject(error);
      else resolve(value);
    };

    const req = https.request(
      {
        hostname: target.hostname,
        // Honours a port in BUNNY_STORAGE_HOST; falls through to 443 when
        // there isn't one, which is the normal case.
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: "PUT",
        headers: {
          AccessKey: accessKey,
          "Content-Type": contentType || "application/octet-stream",
          "Content-Length": contentLength,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            onProgress?.(100);
            finish(null, getBunnyCdnUrl(fileName));
          } else {
            finish(
              new Error(
                `Bunny storage upload failed (${res.statusCode}): ${body || res.statusMessage}`,
              ),
            );
          }
        });
      },
    );

    req.on("error", (error) =>
      finish(new Error(`Bunny storage upload failed: ${error.message}`)),
    );

    const onData = (chunk) => {
      sent += chunk.length;

      if (sent > contentLength) {
        req.destroy();
        finish(new Error("Upload was larger than the size the browser declared"));
        return;
      }

      const ok = req.write(chunk);
      onProgress?.(Math.min(99, Math.round((sent / contentLength) * 100)));

      if (!ok) {
        source.pause();
        req.once("drain", () => source.resume());
      }
    };

    const onEnd = () => {
      if (sent !== contentLength) {
        req.destroy();
        finish(new Error("Upload ended before the whole file arrived"));
        return;
      }

      req.end();
    };

    const onSourceError = (error) => {
      req.destroy();
      finish(new Error(`Upload stream failed: ${error.message}`));
    };

    source.on("data", onData);
    source.on("end", onEnd);
    source.on("error", onSourceError);
  });

// Best-effort cleanup — callers never await this to fail the request over
// it (e.g. during a video delete/replace), but "best-effort" must still
// mean "we'd know if it didn't work": `fetch` only rejects on a
// network-level failure, not on a non-2xx response, so a bad/expired
// AccessKey, wrong storage zone/folder, or a transient Bunny 5xx would
// previously resolve exactly like a real success and leave the file
// orphaned on Bunny forever with zero trace anywhere. Every failure path
// here is now logged so an orphan is at least visible in the server logs
// instead of silently accumulating storage cost.
export const deleteFromBunny = async (fileName) => {
  const { accessKey } = config();

  if (!fileName) return;
  if (!accessKey) {
    console.error(
      `Bunny delete skipped for ${fileName}: BUNNY_STORAGE_ACCESS_KEY is not configured`,
    );
    return;
  }

  try {
    const res = await fetch(buildStorageUrl(fileName), {
      method: "DELETE",
      headers: { AccessKey: accessKey },
    });

    // 404 just means it's already gone (or never existed) — that's the
    // desired end state, not a failure.
    if (!res.ok && res.status !== 404) {
      const body = await res.text().catch(() => "");
      console.error(
        `Bunny delete failed for ${fileName}: ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`,
      );
    }
  } catch (error) {
    console.error(`Bunny delete errored for ${fileName}: ${error.message}`);
  }
};
