import axios from "axios";

import { api } from "./axios";

// Signed-in requests to the new API (account, channel, studio, likes…).
// Keys are v2-specific so a token from the old site is never reused.
export const TOKEN_KEY = "pipra_v2_token";
export const USER_KEY = "pipra_v2_user";
export const CHANNEL_KEY = "pipra_v2_channel";

// Fired when the server rejects the token, so AuthContext can sign out
// without this module importing React state.
export const SESSION_EXPIRED_EVENT = "pipra:session-expired";

export const studioApi = axios.create({ baseURL: api.defaults.baseURL });

studioApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

studioApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && error?.config?.headers?.Authorization) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  },
);

export const apiError = (error, fallback = "Something went wrong") =>
  error?.response?.data?.message || fallback;
