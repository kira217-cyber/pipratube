import { useCallback, useEffect, useState } from "react";

import { get } from "../api/client";

// A paged admin list: debounced search, filters, page number and reload.
export const usePaged = (url, filters = {}) => {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  // The page is remembered per filter set, so changing a filter starts again at 1.
  const [paging, setPaging] = useState({ filters: null, page: 1 });
  const [state, setState] = useState({ key: null, items: [], total: 0, totalPages: 1 });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPaging((p) => ({ ...p, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filterKey = JSON.stringify(filters);
  const page = paging.filters === filterKey ? paging.page : 1;
  const setPage = useCallback((next) => setPaging({ filters: filterKey, page: next }), [filterKey]);
  const key = `${url}|${filterKey}|${query}|${page}|${tick}`;

  useEffect(() => {
    let cancelled = false;
    get(url, { ...JSON.parse(filterKey), search: query || undefined, page })
      .then((data) => !cancelled && setState({ key, items: data.items, total: data.total, totalPages: data.totalPages }))
      .catch(() => !cancelled && setState({ key, items: [], total: 0, totalPages: 1 }));
    return () => {
      cancelled = true;
    };
  }, [url, filterKey, query, page, key]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const update = useCallback((id, patch) => setState((s) => ({ ...s, items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) })), []);

  return { ...state, loading: state.key !== key, search, setSearch, page, setPage, reload, update };
};

export default usePaged;
