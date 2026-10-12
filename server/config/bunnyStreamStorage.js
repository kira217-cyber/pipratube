import { uploadStreamToBunny, deleteFromBunny } from "./bunnyStorage.js";
import { buildBunnyFileName } from "../utils/files.js";
import { setUploadProgress } from "../utils/uploadProgress.js";

// A multer storage engine that sends video/trailer parts straight on to
// Bunny as they arrive, instead of collecting the whole file in memory and
// only then starting the storage upload.
//
// Everything else about the request is unchanged: thumbnails still land in
// `file.buffer` exactly as `multer.memoryStorage()` produced them, so the
// routes' thumbnail handling does not move. A streamed part instead comes
// back carrying `bunnyFileName` and `bunnyUrl`, and the routes use those
// when present.
//
// Streaming needs the exact byte count up front (Bunny requires a
// Content-Length), so it only kicks in when the client declares the size in
// the query string — `?videoBytes=123&trailerBytes=456`. Without that the
// part is buffered exactly as before and the route uploads it the old way,
// which keeps any caller that has not been updated working untouched.

const STREAMED_FIELDS = new Set(["video", "trailer"]);

// Only the main video drives the polled progress figure — a trailer is a
// small extra and would otherwise reset the percentage back to zero.
const PROGRESS_FIELD = "video";

// Reads the query string without relying on Express having parsed it — the
// engine then behaves the same wherever it is mounted, and can be exercised
// against a bare http server in tests.
const query = (req) => {
  if (req.query) return req.query;

  try {
    return Object.fromEntries(
      new URL(req.url, "http://localhost").searchParams.entries(),
    );
  } catch {
    return {};
  }
};

const declaredSize = (req, fieldname) => {
  const size = Number(query(req)[`${fieldname}Bytes`]);
  return Number.isFinite(size) && size > 0 ? size : 0;
};

// Same result as multer.memoryStorage(), kept here so one engine can handle
// both kinds of part.
const collectToBuffer = (file, cb) => {
  const chunks = [];
  let size = 0;

  file.stream.on("data", (chunk) => {
    chunks.push(chunk);
    size += chunk.length;
  });

  file.stream.on("error", cb);

  file.stream.on("end", () => {
    cb(null, { buffer: Buffer.concat(chunks), size });
  });
};

export const bunnyStreamStorage = {
  _handleFile(req, file, cb) {
    if (!STREAMED_FIELDS.has(file.fieldname)) {
      collectToBuffer(file, cb);
      return;
    }

    const size = declaredSize(req, file.fieldname);

    if (!size) {
      collectToBuffer(file, cb);
      return;
    }

    const bunnyFileName = buildBunnyFileName(file.fieldname, file.originalname);
    const uploadId = query(req).uploadId;

    const onProgress =
      uploadId && file.fieldname === PROGRESS_FIELD
        ? (percent) => setUploadProgress(uploadId, percent)
        : undefined;

    uploadStreamToBunny(file.stream, bunnyFileName, file.mimetype, size, onProgress)
      .then((bunnyUrl) => cb(null, { bunnyFileName, bunnyUrl, size }))
      .catch((error) => {
        // The transfer died part-way — the viewer cancelled, the connection
        // dropped, storage refused it. Whatever partial object that left
        // behind is nobody's now, and the response guard below can't catch
        // it because an aborted request never sends one.
        deleteFromBunny(bunnyFileName).catch(() => {});
        cb(error);
      });
  },

  // Called by multer when it aborts a request part-way (a later part fails
  // its filter, a size limit trips). Anything already in storage has to go.
  _removeFile(req, file, cb) {
    if (file.bunnyFileName) {
      deleteFromBunny(file.bunnyFileName).catch(() => {});
    }
    cb(null);
  },
};

// Streaming means a file can already be in storage by the time the route
// decides the request is invalid — a missing title, a bad category, a
// channel that doesn't exist. Those paths return early without unwinding
// anything, so rather than adding cleanup to every one of them, this
// watches the response and clears up whatever was streamed if the request
// did not end in success.
export const discardStreamedUploadsOnFailure = (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) return;

    for (const parts of Object.values(req.files || {})) {
      for (const file of parts) {
        if (file?.bunnyFileName) {
          deleteFromBunny(file.bunnyFileName).catch(() => {});
        }
      }
    }
  });

  next();
};

export default bunnyStreamStorage;
