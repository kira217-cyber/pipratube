import mongoose from "mongoose";

import { publicUrl } from "../utils/localFiles.js";

// A stored file: `url` is what viewers load, `fileName` is how we delete it.
// Local images keep a "/uploads/…" path in the database; the getter turns it
// into a full address on the API's current domain whenever it's read.
export const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, default: null, get: publicUrl },
    fileName: { type: String, default: null },
  },
  { _id: false, toJSON: { getters: true }, toObject: { getters: true } },
);

export default mediaSchema;
