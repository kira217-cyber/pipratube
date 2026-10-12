import { SITE_URL } from "../api/axios";
import { studioApi, TOKEN_KEY } from "../api/studioApi";

// Opens a page on pipratube.com already signed in as the Studio user: the
// API hands out a one-time code and the site trades it for its own session.
// Signed out (or if the code can't be had) it simply opens the page.
export const openSite = async (path = "/") => {
  if (localStorage.getItem(TOKEN_KEY)) {
    try {
      const { data } = await studioApi.post("/api/auth/handoff");
      window.location.href = `${SITE_URL}/sso?code=${encodeURIComponent(data.data.code)}&next=${encodeURIComponent(path)}`;
      return;
    } catch {
      // Fall through to a plain link.
    }
  }
  window.location.href = `${SITE_URL}${path}`;
};
