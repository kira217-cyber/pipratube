import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { studioApi, TOKEN_KEY, USER_KEY, CHANNEL_KEY, SESSION_EXPIRED_EVENT } from "../api/studioApi";
import { clearAuthCache } from "../hooks/useFetch";
import { toast } from "../utils/alerts";

// One account type for everyone (YouTube-style). `channel` is the user's
// own channel, or null until they create one.
const AuthContext = createContext(null);

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};

const store = (key, value) => {
  if (value) localStorage.setItem(key, JSON.stringify(value));
  else localStorage.removeItem(key);
};

export const AuthProvider = ({ children }) => {
  const hasToken = Boolean(localStorage.getItem(TOKEN_KEY));
  const [user, setUserState] = useState(() => (hasToken ? read(USER_KEY) : null));
  const [channel, setChannelState] = useState(() => (hasToken ? read(CHANNEL_KEY) : null));
  const [checking, setChecking] = useState(hasToken);

  const setUser = useCallback((next) => {
    store(USER_KEY, next);
    setUserState(next);
  }, []);

  const setChannel = useCallback((next) => {
    store(CHANNEL_KEY, next);
    setChannelState(next);
  }, []);

  const saveSession = useCallback(
    ({ token, user: nextUser, channel: nextChannel }) => {
      clearAuthCache();
      localStorage.setItem(TOKEN_KEY, token);
      setUser(nextUser);
      setChannel(nextChannel || null);
    },
    [setUser, setChannel],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    clearAuthCache();
    setUser(null);
    setChannel(null);
  }, [setUser, setChannel]);

  const refresh = useCallback(async () => {
    const { data } = await studioApi.get("/api/auth/me");
    setUser(data.data.user);
    setChannel(data.data.channel);
    return data.data;
  }, [setUser, setChannel]);

  // Re-validate a stored session once on load.
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return undefined;
    let cancelled = false;
    studioApi
      .get("/api/auth/me")
      .then(({ data }) => {
        if (cancelled) return;
        setUser(data.data.user);
        setChannel(data.data.channel);
      })
      .catch((error) => {
        if (!cancelled && error?.response?.status === 401) logout();
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [logout, setUser, setChannel]);

  useEffect(() => {
    const onExpired = () => {
      if (!localStorage.getItem(TOKEN_KEY)) return;
      logout();
      toast.error("Session expired. Please sign in again.");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [logout]);

  const login = useCallback(
    async ({ identifier, password }) => {
      const { data } = await studioApi.post("/api/auth/login", { identifier, password });
      saveSession(data.data);
      return data.data;
    },
    [saveSession],
  );

  const register = useCallback(
    async (payload) => {
      const { data } = await studioApi.post("/api/auth/register", payload);
      saveSession(data.data);
      return data.data;
    },
    [saveSession],
  );

  return (
    <AuthContext.Provider value={{ user, channel, checking, login, register, logout, refresh, setUser, setChannel, saveSession }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
