import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, ADMIN_KEY, SESSION_EXPIRED_EVENT, TOKEN_KEY } from "./api/client";
import { toast } from "./utils/alerts";

const AdminAuthContext = createContext(null);

const stored = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) ? JSON.parse(localStorage.getItem(ADMIN_KEY) || "null") : null;
  } catch {
    return null;
  }
};

export const AdminAuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(stored);
  const [checking, setChecking] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
    setAdmin(null);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return undefined;
    let cancelled = false;
    api
      .get("/api/admin/me")
      .then(({ data }) => {
        if (cancelled) return;
        localStorage.setItem(ADMIN_KEY, JSON.stringify(data.data.admin));
        setAdmin(data.data.admin);
      })
      .catch(() => !cancelled && logout())
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [logout]);

  useEffect(() => {
    const onExpired = () => {
      if (!localStorage.getItem(TOKEN_KEY)) return;
      logout();
      toast.error("Session expired — please sign in again");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/api/admin/login", { email, password });
    localStorage.setItem(TOKEN_KEY, data.data.token);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(data.data.admin));
    setAdmin(data.data.admin);
  }, []);

  // Super admins can do everything; sub admins only their permissions.
  const can = useCallback((permission) => Boolean(admin && (admin.role === "super" || !permission || admin.permissions?.includes(permission))), [admin]);

  return <AdminAuthContext.Provider value={{ admin, checking, login, logout, can }}>{children}</AdminAuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAdmin = () => useContext(AdminAuthContext);
