import { STUDIO_URL } from "../api/axios";
import { studioApi, TOKEN_KEY } from "../api/studioApi";

// Opens PipraTube Studio (its own domain, like studio.youtube.com) already
// signed in: the API hands out a one-time code and Studio trades it for its
// own session. Signed out, Studio simply asks the creator to sign in.
export const openStudio = async (path = "/") => {
  if (localStorage.getItem(TOKEN_KEY)) {
    try {
      const { data } = await studioApi.post("/api/auth/handoff");
      window.location.href = `${STUDIO_URL}/sso?code=${encodeURIComponent(data.data.code)}&next=${encodeURIComponent(path)}`;
      return;
    } catch {
      // Fall through to a plain link.
    }
  }
  window.location.href = `${STUDIO_URL}${path}`;
};
