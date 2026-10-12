import { useEffect, useState } from "react";

import { api } from "../api/axios";

// Every home-page section reads its slice from this one shared bundle.
// The last copy is kept in localStorage, so the site paints instantly on
// the next visit and refreshes in the background.
const STORAGE_KEY = "pipra_site_settings_v1";

const readStored = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
};

let cachedSettings = readStored();
let fetchedThisVisit = false;
let inflightPromise = null;
const listeners = new Set();

const fetchSettings = () => {
  if (inflightPromise) return inflightPromise;

  inflightPromise = api
    .get("/api/site/settings")
    .then(({ data }) => {
      const next = data?.data || null;
      if (next) {
        cachedSettings = next;
        fetchedThisVisit = true;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Storage full or blocked — just no instant paint next time.
        }
        listeners.forEach((notify) => notify(next));
      }
      return cachedSettings;
    })
    .catch(() => cachedSettings)
    .finally(() => {
      inflightPromise = null;
    });

  return inflightPromise;
};

export const useSiteSettings = () => {
  const [settings, setSettings] = useState(cachedSettings);

  useEffect(() => {
    listeners.add(setSettings);
    if (!fetchedThisVisit) fetchSettings();
    return () => listeners.delete(setSettings);
  }, []);

  return { settings: settings || cachedSettings, loading: !(settings || cachedSettings) };
};

export default useSiteSettings;
