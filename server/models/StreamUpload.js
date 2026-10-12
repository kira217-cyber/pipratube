import mongoose from "mongoose";

// A video slot opened on Bunny Stream for one uploader. The browser uploads
// straight into it; publishing then attaches it to a Video. Slots that are
// never attached (the upload was abandoned) are deleted from Bunny after a
// day — see utils/streamVideos.js.
const streamUploadSchema = new mongoose.Schema(
  {
    guid: { type: String, required: true, unique: true },
    uploader: { type: String, required: true, index: true }, // "user:<id>" | "admin:<id>"
    fileName: { type: String, default: "" },
    size: { type: Number, default: 0 },
    video: { type: mongoose.Schema.Types.ObjectId, ref: "Video", default: null, index: true },
  },
  { timestamps: true },
);

const StreamUpload = mongoose.model("StreamUpload", streamUploadSchema);

export default StreamUpload;
