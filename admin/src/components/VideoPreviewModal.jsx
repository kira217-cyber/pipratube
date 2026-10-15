import React, { useState } from "react";
import { ExternalLink, VideoOff } from "lucide-react";

import { Modal } from "./kit";
import { SITE_URL } from "../api/client";
import { isOnSite } from "../utils/videos";

// Videos the site won't show (held for review, removed, private, still
// processing…) play here instead, so an admin can always see what a video is.

const VideoPreviewModal = ({ video, onClose }) => {
  const [failed, setFailed] = useState(false);
  const src = video.videoUrl;
  const vertical = video.isShort || (video.height > video.width && video.width > 0);

  return (
    <Modal title={video.title} wide onClose={onClose}>
      {src && !failed ? (
        <video
          src={src}
          poster={video.thumbnail || undefined}
          controls
          autoPlay
          playsInline
          onError={() => setFailed(true)}
          className={`mx-auto rounded-xl bg-black ${vertical ? "aspect-[9/16] max-h-[70vh]" : "aspect-video w-full"}`}
        />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-black text-sm text-muted">
          <VideoOff className="h-8 w-8" />
          {src ? "This video file couldn't be played" : "The video file is no longer stored"}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>
          {video.channel?.name}
          {video.removedReason ? ` · ${video.removedReason}` : ""}
        </span>
        {isOnSite(video) && (
          <a href={`${SITE_URL}/watch/${video.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#3ea6ff] hover:underline">
            Open on site <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </Modal>
  );
};

export default VideoPreviewModal;
