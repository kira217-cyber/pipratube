import crypto from "crypto";
import path from "path";

// Never trust the client-supplied name for a storage key — generate a
// fresh, collision-proof one instead.
export const buildBunnyFileName = (prefix, originalName) => {
  const ext = (path.extname(originalName || "") || ".bin").toLowerCase();
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}${ext}`;
};

export default buildBunnyFileName;
