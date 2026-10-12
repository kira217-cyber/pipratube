import React from "react";
import { Link } from "react-router";
import { BadgeCheck } from "lucide-react";

import { Avatar } from "../ui/ui";
import VideoPreview from "../VideoPreview/VideoPreview";
import { channelPath, videoId, videoMeta } from "../../utils/format";
import VideoMenu from "../VideoMenu/VideoMenu";
import HiddenNotice from "../VideoMenu/HiddenNotice";
import { HoverPanel, cardMenuClass } from "../VideoCard/VideoCard";
import { hiddenReason, useVideoPrefs } from "../../utils/videoPrefs";

// Full-width feed card from the new Home design: big poster, then the
// channel avatar beside a two-line title and "channel ✓ · views · age".
const FeedCard = ({ video, eager = false }) => {
  const prefs = useVideoPrefs();
  const hidden = hiddenReason(prefs, video);
  const to = `/watch/${videoId(video)}`;
  if (hidden) return <HiddenNotice video={video} reason={hidden} className="min-h-[14rem]" />;
  return (
    <article className="group/card relative isolate min-w-0">
      <HoverPanel />
      <Link to={to} className="block overflow-hidden rounded-2xl border border-line bg-card-2">
        <VideoPreview
          id={`feed-${videoId(video)}`}
          src={video.videoUrl}
          poster={video.thumbnail}
          alt={video.title}
          duration={video.duration}
          eager={eager}
          autoplayInView
          className="aspect-video"
        />
      </Link>

      <div className="mt-3 flex gap-3">
        <Link to={channelPath(video.channel)} className="shrink-0">
          <Avatar src={video.channel?.avatar} name={video.channel?.name} size="h-10 w-10" ring={false} />
        </Link>
        <Link to={to} className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-white sm:text-base">{video.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
            {video.channel?.name && (
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate">{video.channel?.name}</span>
                {video.channel?.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 fill-muted text-page" />}
              </span>
            )}
            {videoMeta(video) && <span>{videoMeta(video)}</span>}
          </p>
        </Link>
        <VideoMenu video={video} className={cardMenuClass} />
      </div>
    </article>
  );
};

export default FeedCard;
