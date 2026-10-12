import { useEffect } from "react";

import { mediaUrl } from "../utils/format";
import { useSiteSettings } from "./useSiteSettings";

// index.html ships a bundled default icon; this is only swapped in when
// an admin has actually uploaded one from Site Identify.
const DEFAULT_FAVICON = "/favicon.png";

const setIconHref = (rel, href) => {
  let link = document.querySelector(`link[rel="${rel}"]`);

  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }

  // The type attribute from index.html ("image/svg+xml") would fight an
  // uploaded PNG/ICO, so let the browser sniff it instead.
  link.removeAttribute("type");
  link.href = href;
};

// Applies the admin-uploaded favicon (Site Identify → Site Favicon) to the
// client site's browser tab. Called once from RootLayout so every route —
// public, live TV, and the private section — gets it.
export const useSiteFavicon = () => {
  const { settings } = useSiteSettings();
  const favicon = settings?.favicon;

  useEffect(() => {
    const href = favicon
      ? mediaUrl(favicon)
      : DEFAULT_FAVICON;

    setIconHref("icon", href);
    setIconHref("apple-touch-icon", href);
  }, [favicon]);
};

export default useSiteFavicon;
