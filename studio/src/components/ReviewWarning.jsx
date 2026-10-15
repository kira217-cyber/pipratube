import React, { useEffect, useState } from "react";
import { ShieldAlert, Trash2 } from "lucide-react";

import { apiError, studioApi } from "../api/studioApi";
import { confirmDialog, toast } from "../utils/alerts";

// The big warning on the dashboard (and Content) when the adult-content
// check is holding one of the creator's videos: it isn't public, and they're
// asked to delete it. Also shows strikes — at 3 the account is blocked.
const ReviewWarning = ({ onChange }) => {
  const [data, setData] = useState(null);

  const load = () =>
    studioApi
      .get("/api/studio/moderation")
      .then(({ data: res }) => setData(res.data))
      .catch(() => setData(null));

  useEffect(() => {
    load();
  }, []);

  if (!data || (!data.inReview.length && !data.strikes)) return null;

  const remove = async (video) => {
    if (!(await confirmDialog(`Delete "${video.title}"?`, { text: "It will be removed from your channel.", confirmText: "Delete video" }))) return;
    try {
      await studioApi.delete(`/api/studio/videos/${video.id}`);
      toast.success("Video deleted");
      await load();
      onChange?.();
    } catch (error) {
      toast.error(apiError(error, "Couldn't delete the video"));
    }
  };

  return (
    <div className="rounded-2xl border-2 border-[#e3172f] bg-[#e3172f]/12 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-7 w-7 shrink-0 text-[#ff6b81]" />
        <div className="min-w-0 flex-1">
          {data.inReview.length > 0 ? (
            <>
              <p className="text-lg font-bold text-[#ff6b81] sm:text-xl">
                {data.inReview.length === 1 ? "1 video is under review" : `${data.inReview.length} videos are under review`}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-white/90">
                {data.inReview.length === 1 ? "It isn't" : "They aren't"} public until our team reviews {data.inReview.length === 1 ? "it" : "them"} — the reason is under each video. Adult content isn't allowed on PipraTube: <b>if a video has sexual scenes, please delete it</b>. If our team removes a video, your account gets a strike.
              </p>
            </>
          ) : (
            <p className="text-lg font-bold text-[#ff6b81]">Your account has a strike</p>
          )}
          <p className="mt-2 inline-flex rounded-full bg-black/30 px-3 py-1 text-sm font-semibold">
            Strikes: {data.strikes} of {data.strikesToBlock} — at {data.strikesToBlock} the account is blocked
          </p>
        </div>
      </div>
      {data.inReview.length > 0 && (
        <ul className="mt-4 space-y-2">
          {data.inReview.map((video) => (
            <li key={video.id} className="flex items-center gap-3 rounded-xl bg-black/30 p-2 pr-3">
              <span className="aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-black">
                {video.thumbnail && <img src={video.thumbnail} alt="" className="h-full w-full object-cover blur-sm" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{video.title}</span>
                {video.moderation?.reason && <span className="mt-0.5 line-clamp-2 block text-xs text-white/70">{video.moderation.reason}</span>}
              </span>
              <button type="button" onClick={() => remove(video)} className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#e3172f] px-3 py-2 text-sm font-semibold text-white hover:brightness-110">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ReviewWarning;
