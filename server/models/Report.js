import mongoose from "mongoose";

// A viewer flagging a video (YouTube's "Report"). Admins review them in the
// panel and either take the video down or dismiss the report.
export const REPORT_REASONS = {
  sexual: "Sexual content",
  violent: "Violent or repulsive content",
  hateful: "Hateful or abusive content",
  harassment: "Harassment or bullying",
  dangerous: "Harmful or dangerous acts",
  misinformation: "Misinformation",
  child_abuse: "Child abuse",
  terrorism: "Promotes terrorism",
  spam: "Spam or misleading",
  copyright: "Copyright / legal issue",
  captions: "Captions issue",
};

const reportSchema = new mongoose.Schema(
  {
    video: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true, index: true },
    reason: { type: String, enum: Object.keys(REPORT_REASONS), required: true },
    details: { type: String, trim: true, maxlength: 500, default: "" },
    // Signed-in reporter, or the anonymous visitor id for signed-out viewers.
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    visitorId: { type: String, default: null },
    status: { type: String, enum: ["open", "resolved", "dismissed"], default: "open", index: true },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const Report = mongoose.model("Report", reportSchema);
export default Report;
