import React, { useMemo } from "react";
import { Navigate, useParams } from "react-router";

import LiveTvPlayer from "../../components/LiveTvPlayer/LiveTvPlayer";
import { Spinner } from "../../components/ui/ui";
import { LogoTile, SectionPanel } from "./liveTvUi";
import { useFetch } from "../../hooks/useFetch";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useLiveTvAvailability } from "../../hooks/useLiveTvAvailability";

// A single Live TV channel opened by link (Home's Live TV row, View All).
const LiveTvWatch = () => {
  const { id } = useParams();
  const { data, loading, error } = useFetch(`/api/site/live-tv/${id}`);

  const related = useMemo(() => data?.related || [], [data]);
  useDocumentTitle(data?.channel?.name ? `${data.channel.name} Live` : null);
  const { isAvailable, markUnavailable } = useLiveTvAvailability(related);
  const visibleRelated = related.filter(isAvailable);

  if (error) return <Navigate to="/live-tv" replace />;
  if (loading || !data) return <Spinner className="min-h-[60vh]" />;

  return (
    <div>
      <div className="player-frame -mx-2 sm:mx-auto">
        <LiveTvPlayer channel={data.channel} initialNowPlaying={data.nowPlaying} onUnavailable={markUnavailable} />
      </div>

      {visibleRelated.length > 0 && (
        <div className="mt-5">
          <SectionPanel sectionKey="__pinned" title="More Channels" seeAllTo="/live-tv">
            {visibleRelated.map((channel) => (
              <LogoTile key={channel._id} channel={channel} to={`/live-tv/${channel._id}`} />
            ))}
          </SectionPanel>
        </div>
      )}
    </div>
  );
};

export default LiveTvWatch;
