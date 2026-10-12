import axios from "axios";

// PipraTube Studio talks to the same API as the viewer site.
// Production builds use api.pipratube.com unless VITE_API_URL says otherwise.
export const API_ORIGIN = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "https://api.pipratube.com" : "http://localhost:5100")).replace(/\/$/, "");

// The viewer site (pipratube.com) — watch pages, channel pages, Home.
export const SITE_URL = (import.meta.env.VITE_SITE_URL || (import.meta.env.PROD ? "https://pipratube.com" : "http://localhost:5173")).replace(/\/$/, "");

// In `npm run dev` requests go through Vite (see vite.config.js); a
// production build calls API_ORIGIN directly.
export const api = axios.create({ baseURL: import.meta.env.DEV ? "" : API_ORIGIN });
