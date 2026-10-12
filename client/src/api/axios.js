import axios from "axios";

// The new Pipra-TV API (Pipra-TV-NEW-VERSION/server).
// Production builds talk to api.pipratube.com unless VITE_API_URL says otherwise.
export const API_ORIGIN = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "https://api.pipratube.com" : "http://localhost:5100")).replace(/\/$/, "");

// PipraTube Studio is its own app (studio.pipratube.com), like YouTube Studio.
export const STUDIO_URL = (import.meta.env.VITE_STUDIO_URL || (import.meta.env.PROD ? "https://studio.pipratube.com" : "http://localhost:5177")).replace(/\/$/, "");

// In `npm run dev` requests go through Vite (see vite.config.js); a
// production build calls API_ORIGIN directly.
export const api = axios.create({ baseURL: import.meta.env.DEV ? "" : API_ORIGIN });
