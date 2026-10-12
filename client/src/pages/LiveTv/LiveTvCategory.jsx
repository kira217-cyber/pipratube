import React from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";

import { EmptyState, Spinner } from "../../components/ui/ui";
import { useLiveTvChannels } from "./useLiveTvChannels";
import { LogoTile, SectionPanel } from "./liveTvUi";

// "See All" for one Live TV section (a category, or "pinned").
const LiveTvCategory = () => {
  const { key } = useParams();
  const { channels, categories, loading } = useLiveTvChannels();

  if (loading && !channels.length) return <Spinner className="min-h-[60vh]" />;

  const isPinned = key === "pinned";
  const category = categories.find((item) => item.key === key);
  const list = isPinned
    ? channels.filter((channel) => channel.channelType === "scheduled" || channel.pinned)
    : channels.filter((channel) => channel.categories?.includes(key));
  const title = isPinned ? "Top - Premium Channel" : key === "bangladeshi" ? "Bangladesh TV Channel" : category?.label || "Channels";

  return (
    <div className="player-frame -mx-2 sm:mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/live-tv"
          aria-label="Back to Live TV"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card-2 hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <p className="text-sm text-muted">{list.length} channels</p>
      </div>

      {list.length === 0 ? (
        <EmptyState title="No channels here yet" />
      ) : (
        <SectionPanel sectionKey={isPinned ? "__pinned" : key} title={title}>
          {list.map((channel) => (
            <LogoTile key={channel._id} channel={channel} to={`/live-tv/${channel._id}`} />
          ))}
        </SectionPanel>
      )}
    </div>
  );
};

export default LiveTvCategory;
