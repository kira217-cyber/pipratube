import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Film } from "lucide-react";

import { FeaturedVideo, VideoGrid, VideoRail } from "../../components/VideoCard/VideoCard";
import { Chips, EmptyState, GhostButton, PageHeader, SectionHeader, Spinner } from "../../components/ui/ui";
import { api } from "../../api/axios";
import { useFetch } from "../../hooks/useFetch";
import { VIDEO_CATEGORIES } from "../../utils/categories";

const PAGE_SIZE = 20;

// Videos page from the design: category chips, one big featured video,
// a "Recommended" row, then every video newest-first with "Load more".
const Videos = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get("category") || "";
  const params = category ? { category } : {};

  const { data: random, loading: loadingRandom } = useFetch("/api/videos", {
    ...params,
    sort: "random",
    // 1 featured + up to 10 in the row; the rest open with "See more".
    limit: 31,
  });

  const [latest, setLatest] = useState({ key: null, videos: [], page: 1, totalPages: 1 });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/videos", { params: { ...(category ? { category } : {}), sort: "latest", limit: PAGE_SIZE, page: 1 } })
      .then(({ data }) => {
        if (cancelled) return;
        setLatest({
          key: category,
          videos: data?.data?.videos || [],
          page: 1,
          totalPages: data?.data?.totalPages || 1,
        });
      })
      .catch(() => {
        if (!cancelled) setLatest({ key: category, videos: [], page: 1, totalPages: 1 });
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = latest.page + 1;
      const { data } = await api.get("/api/videos", { params: { ...params, sort: "latest", limit: PAGE_SIZE, page } });
      setLatest((previous) => ({
        ...previous,
        videos: [...previous.videos, ...(data?.data?.videos || [])],
        page,
        totalPages: data?.data?.totalPages || previous.totalPages,
      }));
    } finally {
      setLoadingMore(false);
    }
  };

  const pool = random?.videos || [];
  const featured = pool[0];
  const recommended = pool.slice(1);
  const latestReady = latest.key === category;

  return (
    <div>
      <PageHeader title="Videos" subtitle="Watch your favorite movies, dramas, cartoons and more" />

      <Chips
        items={VIDEO_CATEGORIES}
        value={category}
        onChange={(value) => setSearchParams(value ? { category: value } : {})}
        className="mb-5"
      />

      {loadingRandom ? (
        <Spinner />
      ) : !featured ? (
        <EmptyState icon={Film} title="No videos yet" text="Nothing has been published in this category yet." />
      ) : (
        <div className="space-y-8">
          <div className="lg:max-w-4xl">
            <FeaturedVideo video={featured} />
          </div>

          {recommended.length > 0 && (
            <section>
              <SectionHeader title="Recommended for You" />
              <VideoRail videos={recommended} />
            </section>
          )}

          <section>
            <SectionHeader title="Latest Videos" />
            {latestReady ? (
              <>
                <VideoGrid videos={latest.videos} />
                {latest.page < latest.totalPages && (
                  <div className="mt-6 flex justify-center">
                    <GhostButton onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? "Loading..." : "Load more"}
                    </GhostButton>
                  </div>
                )}
              </>
            ) : (
              <Spinner />
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default Videos;
