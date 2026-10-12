import Video from "../models/Video.js";
import { claimSession, getSession } from "./uploadSessions.js";
import { enqueueVideo } from "./videoPipeline.js";

// Turns a finished chunked upload into a video that's "processing": it is
// converted, saved to Bunny and published in the background. `fields` are
// the usual video details (channel, owner, title, thumbnail…).
export const videoFromUpload = async ({ uploadId, uploader, fields, apply }) => {
  const session = getSession(uploadId, uploader);
  if (!session) {
    const error = new Error("This upload has expired — please upload the file again");
    error.status = 410;
    throw error;
  }
  if (session.received !== session.size) {
    const error = new Error("The upload isn't finished yet");
    error.status = 409;
    throw error;
  }
  const originalName = session.fileName;
  const source = claimSession(session);
  const video = new Video({ ...fields, status: "processing", processing: { stage: "queued", percent: 0, source, originalName } });
  apply?.(video);
  await video.save();
  enqueueVideo(video._id);
  return video;
};
