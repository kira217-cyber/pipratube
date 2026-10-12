import { useEffect } from "react";

// The browser tab shows what's on screen, like YouTube: "Video title - PipraTube".
// Leaving the page puts the site's own title back.
const SITE_TITLE = typeof document !== "undefined" ? document.title : "PipraTube";

export const pageTitle = (title) => (title ? `${title} - PipraTube` : SITE_TITLE);

export const setPageTitle = (title) => {
  document.title = pageTitle(title);
};

export const useDocumentTitle = (title) => {
  useEffect(() => {
    if (!title) return undefined;
    setPageTitle(title);
    return () => {
      document.title = SITE_TITLE;
    };
  }, [title]);
};
