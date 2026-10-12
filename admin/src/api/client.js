import axios from "axios";

import { trackRequests } from "../utils/requestTracker";

// Admin API (Pipra-TV-NEW-VERSION/server, /api/admin/*). In development
// requests go through Vite's proxy; a build calls VITE_API_URL directly.
export const TOKEN_KEY = "pipra_admin_token";
export const ADMIN_KEY = "pipra_admin";
export const SESSION_EXPIRED_EVENT = "pipra-admin:expired";

const origin = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "https://api.pipratube.com" : "http://localhost:5100")).replace(/\/$/, "");

export const api = axios.create({ baseURL: import.meta.env.DEV ? "" : origin });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && error?.config?.headers?.Authorization) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  },
);

trackRequests(api);

// nginx answers 413 (with an HTML page, not our JSON) when a file is over
// its upload limit (client_max_body_size).
const TOO_LARGE = "This file is bigger than the server accepts. Raise client_max_body_size for the API in nginx.";
export const apiError = (error, fallback = "Something went wrong") =>
  error?.response?.data?.message || (error?.response?.status === 413 ? TOO_LARGE : fallback);

// Unwraps the server's { success, message, data } envelope.
export const get = (url, params) => api.get(url, { params }).then((r) => r.data.data);
export const send = (method, url, body, config) => api[method](url, body, config).then((r) => r.data.data);

export const SITE_URL = (import.meta.env.VITE_SITE_URL || (import.meta.env.PROD ? "https://pipratube.com" : "http://localhost:5173")).replace(/\/$/, "");
