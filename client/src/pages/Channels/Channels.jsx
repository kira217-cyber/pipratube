import React, { useEffect, useState } from "react";
import { Search, Users } from "lucide-react";

import ChannelCircle from "../../components/ChannelCircle/ChannelCircle";
import { EmptyState, GhostButton, PageHeader, Spinner } from "../../components/ui/ui";
import { api } from "../../api/axios";
import { channelPath } from "../../utils/format";

const PAGE_SIZE = 40;

// Every creator channel, searchable.
const Channels = () => {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ key: null, channels: [], page: 1, totalPages: 1 });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/channels", { params: { search: query || undefined, limit: PAGE_SIZE, page: 1 } })
      .then(({ data }) => {
        if (!cancelled) {
          setState({
            key: query,
            channels: data?.data?.channels || [],
            page: 1,
            totalPages: data?.data?.totalPages || 1,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ key: query, channels: [], page: 1, totalPages: 1 });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = state.page + 1;
      const { data } = await api.get("/api/channels", {
        params: { search: query || undefined, limit: PAGE_SIZE, page },
      });
      setState((previous) => ({
        ...previous,
        channels: [...previous.channels, ...(data?.data?.channels || [])],
        page,
      }));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div>
      <PageHeader title="Channels" subtitle="Discover creators on PipraTube">
        <label className="flex h-11 w-full items-center gap-2 rounded-full border border-line bg-card-2 px-4 sm:w-72">
          <Search className="h-4 w-4 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search channels..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
        </label>
      </PageHeader>

      {state.key !== query ? (
        <Spinner />
      ) : state.channels.length === 0 ? (
        <EmptyState icon={Users} title="No channels found" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-5 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9">
            {state.channels.map((channel) => (
              <ChannelCircle key={channel.id} name={channel.name} logo={channel.avatar} to={channelPath(channel)} />
            ))}
          </div>
          {state.page < state.totalPages && (
            <div className="mt-8 flex justify-center">
              <GhostButton onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading..." : "Load more"}
              </GhostButton>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Channels;
