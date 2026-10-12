import { useEffect, useState } from "react";

import { api } from "../api/axios";

// Responses are kept for the whole visit (stale-while-revalidate): going
// back to a page shows its last data instantly and quietly refreshes it.
const cache = new Map(); // key -> data
const inflight = new Map(); // key -> promise

const keyOf = (url, params, client) =>
  url ? `${client === api ? "" : "auth:"}${url}?${JSON.stringify(params || {})}` : null;

const load = (key, url, params, client) => {
  if (!inflight.has(key)) {
    inflight.set(
      key,
      client
        .get(url, { params })
        .then(({ data }) => {
          const value = data?.data ?? null;
          cache.set(key, value);
          return value;
        })
        .finally(() => inflight.delete(key)),
    );
  }
  return inflight.get(key);
};

// Forget signed-in data (on login/logout) so one account never sees
// another's cached responses.
export const clearAuthCache = () => {
  [...cache.keys()].forEach((key) => key.startsWith("auth:") && cache.delete(key));
};

// Warm the cache ahead of navigation (e.g. on hover).
export const prefetch = (url, params, client = api) => {
  const key = keyOf(url, params, client);
  if (key && !cache.has(key)) load(key, url, params, client).catch(() => {});
};

// GET `url` (with `params`) and hand back the response's `data` field.
// Pass a null url to skip the request. Re-runs whenever url/params change.
export const useFetch = (url, params, client = api) => {
  const key = keyOf(url, params, client);
  const [state, setState] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;

    load(key, url, params, client)
      .then((data) => {
        if (!cancelled) setState({ key, data, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ key, data: null, error });
      });

    return () => {
      cancelled = true;
    };
    // `key` already captures url + params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client]);

  const fresh = state.key === key;
  const cached = key && cache.has(key) ? cache.get(key) : null;

  return {
    data: fresh ? state.data ?? cached : cached,
    error: fresh ? state.error : null,
    loading: Boolean(key) && !fresh && !cache.has(key),
  };
};

export default useFetch;
