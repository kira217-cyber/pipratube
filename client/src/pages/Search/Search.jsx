import React from "react";
import { useSearchParams } from "react-router";
import { SearchX } from "lucide-react";

import ChannelCircle, { ChannelRail, railItemClass } from "../../components/ChannelCircle/ChannelCircle";
import { VideoGrid } from "../../components/VideoCard/VideoCard";
import { EmptyState, SectionHeader, Spinner } from "../../components/ui/ui";
import { useFetch } from "../../hooks/useFetch";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { channelPath } from "../../utils/format";

const Search = () => {
  const [params] = useSearchParams();
  const q = (params.get("q") || "").trim();
  useDocumentTitle(q || "Search");

  const { data: videos, loading: loadingVideos } = useFetch(q ? "/api/videos" : null, { search: q, limit: 40 });
  const { data: channels } = useFetch(q ? "/api/channels" : null, { search: q, limit: 20 });

  if (!q) return <EmptyState icon={SearchX} title="Search PipraTube" text="Type a video or channel name in the search box." />;

  const videoList = videos?.videos || [];
  const channelList = channels?.channels || [];

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold sm:text-2xl">
        Results for <span className="text-brand">“{q}”</span>
      </h1>

      {channelList.length > 0 && (
        <section>
          <SectionHeader title="Channels" />
          <ChannelRail>
            {channelList.map((channel) => (
              <ChannelCircle
                key={channel.id}
                name={channel.name}
                logo={channel.avatar}
                to={channelPath(channel)}
                className={railItemClass}
              />
            ))}
          </ChannelRail>
        </section>
      )}

      <section>
        <SectionHeader title="Videos" />
        {loadingVideos ? (
          <Spinner />
        ) : videoList.length === 0 ? (
          <EmptyState icon={SearchX} title="No videos found" text="Try a different word or check the spelling." />
        ) : (
          <VideoGrid videos={videoList} />
        )}
      </section>
    </div>
  );
};

export default Search;
