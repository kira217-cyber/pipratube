import React from "react";

import { hideChannel, hideVideo } from "../../utils/videoPrefs";

// What a card turns into after "Not interested" / "Don't recommend
// channel" — YouTube's grey box with an Undo, so a mis-tap is easy to fix.
const HiddenNotice = ({ video, reason, className = "" }) => (
  <div className={`flex min-h-[7rem] flex-col items-start justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4 ${className}`}>
    <p className="text-sm font-semibold text-white">{reason === "channel" ? "Channel won't be recommended" : "Video removed"}</p>
    <p className="text-xs text-muted">
      {reason === "channel" ? `You won't see videos from ${video.channel?.name || "this channel"} here.` : "We'll show you fewer videos like this."}
    </p>
    <button
      type="button"
      onClick={() => (reason === "channel" ? hideChannel(video.channel.id, false) : hideVideo(video.id, false))}
      className="cursor-pointer rounded-full border border-white/20 px-4 py-1.5 text-sm font-semibold text-[#3ea6ff] hover:bg-white/10"
    >
      Undo
    </button>
  </div>
);

export default HiddenNotice;
