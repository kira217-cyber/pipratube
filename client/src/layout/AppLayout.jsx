import React, { Suspense, useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { FacebookIcon, InstagramIcon, TelegramIcon, TiktokIcon, YoutubeIcon } from "./socialIcons";

import Header from "../components/Header/Header";
import BottomNav from "../components/BottomNav/BottomNav";
import NavMenu from "../components/NavMenu/NavMenu";
import DesktopSidebar, { SIDEBAR_FULL, SIDEBAR_MINI } from "./DesktopSidebar";
import { Logo, Spinner } from "../components/ui/ui";
import { getPresenceSocket } from "../hooks/presenceSocket";
import { useSiteFavicon } from "../hooks/useSiteFavicon";
import { useSiteSettings } from "../hooks/useSiteSettings";

const Footer = () => {
  const { settings } = useSiteSettings();
  const links = settings?.socialLinks || {};
  const social = [
    { url: links.facebook, icon: FacebookIcon, label: "Facebook" },
    { url: links.youtube, icon: YoutubeIcon, label: "YouTube" },
    { url: links.telegram, icon: TelegramIcon, label: "Telegram" },
    { url: links.instagram, icon: InstagramIcon, label: "Instagram" },
    { url: links.tiktok, icon: TiktokIcon, label: "TikTok" },
  ].filter((item) => item.url);

  return (
    <footer className="mt-10 hidden border-t border-line px-6 py-8 lg:block">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <Logo className="h-9" />
          <p className="mt-2 text-sm text-muted">Watch Together, Grow Together.</p>
        </div>

        {settings?.footerLinks?.length > 0 && (
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
            {settings.footerLinks.map((link) => (
              <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="hover:text-white">
                {link.label}
              </a>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {social.map(({ url, icon: Icon, label }) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={label}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-card-2 text-white transition hover:bg-brand"
            >
              <Icon />
            </a>
          ))}
        </div>
      </div>
      <p className="mt-6 text-xs text-slate-500">
        © {new Date().getFullYear()} {settings?.siteName || "PipraTube"}. All rights reserved.
        {settings?.contactEmail && (
          <>
            {" "}·{" "}
            <a href={`mailto:${settings.contactEmail}`} className="hover:text-white">
              {settings.contactEmail}
            </a>
          </>
        )}{" "}
        · <Link to="/channels" className="hover:text-white">Channels</Link>
      </p>
    </footer>
  );
};

// One-line notice from admin → Site settings → Announcement bar.
const Announcement = () => {
  const { settings } = useSiteSettings();
  const note = settings?.announcement;
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem("pipra_announcement_hidden") === note?.text;
    } catch {
      return false;
    }
  });
  if (!note?.text || hidden) return null;
  const text = <span className="min-w-0 flex-1 truncate">{note.text}</span>;
  return (
    <div className="-mx-4 mb-4 flex items-center gap-3 bg-brand-gradient px-4 py-2 text-sm font-medium sm:mx-0 sm:rounded-xl">
      {note.url ? (
        <a href={note.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 hover:underline">
          {text}
        </a>
      ) : (
        text
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            sessionStorage.setItem("pipra_announcement_hidden", note.text);
          } catch {
            // Storage blocked — it just comes back next page.
          }
          setHidden(true);
        }}
        className="cursor-pointer rounded-full px-1.5 text-white/90 hover:bg-white/20"
      >
        ✕
      </button>
    </div>
  );
};

const SIDEBAR_KEY = "pipra_sidebar";

const AppLayout = () => {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop sidebar: full menu or icons only — remembered between visits.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) !== "mini";
    } catch {
      return true;
    }
  });

  useSiteFavicon();

  // Live visitor feed for admin → Site Analytics, same as the old site.
  useEffect(() => {
    getPresenceSocket().emit("page:view", { path: location.pathname });
  }, [location.pathname]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // The drawer covers the page; stop the page scrolling behind it.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const isShorts = location.pathname.startsWith("/shorts");

  const toggleMenu = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSidebarOpen((value) => {
        try {
          localStorage.setItem(SIDEBAR_KEY, value ? "mini" : "full");
        } catch {
          // Storage blocked — it just won't be remembered.
        }
        return !value;
      });
    } else {
      setDrawerOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-page text-white">
      {/* Shorts is full-screen on phones — no top bar there. */}
      <div className={isShorts ? "hidden lg:block" : undefined}>
        <Header onMenu={toggleMenu} />
      </div>

      {/* Mobile / tablet drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-[84%] max-w-sm overflow-y-auto bg-header px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl transition-transform duration-300 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <NavMenu showBrowse onNavigate={() => setDrawerOpen(false)} />
        </aside>
      </div>

      <DesktopSidebar open={sidebarOpen} />

      {/* The page moves over with the same easing as the sidebar. */}
      <div
        className={`${isShorts ? "lg:pt-16" : "pt-16"} transition-[padding] duration-300 ease-[cubic-bezier(0.2,0,0,1)] lg:pl-[var(--sidebar)]`}
        style={{ "--sidebar": sidebarOpen ? SIDEBAR_FULL : SIDEBAR_MINI }}
      >
        {isShorts ? (
          <Suspense fallback={<Spinner className="min-h-[60vh]" />}>
            <Outlet />
          </Suspense>
        ) : (
          <main className="pb-bottom-nav mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
            <Announcement />
            <Suspense fallback={<Spinner className="min-h-[60vh]" />}>
              <Outlet />
            </Suspense>
            <Footer />
          </main>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default AppLayout;
