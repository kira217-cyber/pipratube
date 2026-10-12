import React, { useMemo, useState } from "react";
import { Tv } from "lucide-react";

import LiveTvPlayer from "../../components/LiveTvPlayer/LiveTvPlayer";
import { EmptyState, Spinner } from "../../components/ui/ui";
import { useLiveTvChannels } from "./useLiveTvChannels";
import { LogoTile, QuickFilters, SectionPanel } from "./liveTvUi";

const PINNED = "__pinned";
const OTHER = "__other";
const PER_SECTION = 8; // two rows of four on a phone

// Live TV from the design: framed player, channel bar, six quick filters,
// then one neon panel per category with its channels as logo tiles.
// Tapping a tile switches the player in place.
const LiveTv = () => {
  const { channels, categories, loading, markUnavailable } = useLiveTvChannels();
  const [picked, setPicked] = useState(null);
  const [filter, setFilter] = useState("");

  const own = channels.find((channel) => channel.channelType === "scheduled");
  const selected =
    (picked && channels.find((channel) => channel._id === picked._id)) || own || channels[0] || null;

  const sections = useMemo(() => {
    const result = [];

    // "Top – Premium": Pipra-TV first, then admin-pinned channels.
    const premium = [own, ...channels.filter((channel) => channel.pinned && channel !== own)].filter(Boolean);
    if (premium.length) result.push({ key: PINNED, title: "Top - Premium Channel", all: premium });

    categories.forEach((category) => {
      const all = channels.filter((channel) => channel.categories?.includes(category.key));
      if (!all.length) return;
      const onList = all.filter((channel) => channel.showOnList);
      const label = category.key === "bangladeshi" ? "Bangladesh TV Channel" : category.label;
      result.push({ key: category.key, title: label, all, shortlist: onList.length >= 4 ? onList : all });
    });

    const other = channels.filter((channel) => channel.channelType !== "scheduled" && !channel.categories?.length);
    if (other.length) result.push({ key: OTHER, title: "Other Channels", all: other });

    return result;
  }, [channels, categories, own]);

  const select = (channel) => {
    setPicked(channel);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading && !channels.length) return <Spinner className="min-h-[60vh]" />;
  if (!channels.length) {
    return <EmptyState icon={Tv} title="No channels right now" text="Please check back in a little while." />;
  }

  const visible = filter ? sections.filter((section) => section.key === filter) : sections;

  return (
    <div className="player-frame -mx-2 space-y-5 sm:mx-auto">
      {selected && <LiveTvPlayer channel={selected} onUnavailable={markUnavailable} />}

      <QuickFilters value={filter} onChange={setFilter} />

      {visible.length === 0 && <p className="py-10 text-center text-muted">No channels in this category yet.</p>}

      {visible.map((section) => {
        const expanded = Boolean(filter);
        const list = expanded ? section.all : (section.shortlist || section.all).slice(0, PER_SECTION);
        const more = !expanded && section.all.length > list.length;
        return (
          <SectionPanel
            key={section.key}
            sectionKey={section.key}
            title={section.title}
            seeAllTo={more && section.key !== OTHER ? `/live-tv/category/${section.key === PINNED ? "pinned" : section.key}` : undefined}
            onSeeAll={more && section.key === OTHER ? () => setFilter(OTHER) : undefined}
          >
            {list.map((channel) => (
              <LogoTile
                key={channel._id}
                channel={channel}
                active={channel._id === selected?._id}
                onClick={() => select(channel)}
              />
            ))}
          </SectionPanel>
        );
      })}
    </div>
  );
};

export default LiveTv;
