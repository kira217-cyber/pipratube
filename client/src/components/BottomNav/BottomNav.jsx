import React from "react";
import { Link, NavLink, useLocation } from "react-router";
import { House, Plus, Tv, UserRound } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import StudioLink from "../StudioLink/StudioLink";

// Shorts mark — a play triangle in a rounded "S" frame.
const ShortsIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M15.5 3.2 7.9 7.4a3.4 3.4 0 0 0 .2 6l.7.3-1.1.6a3.4 3.4 0 1 0 3.3 6l7.6-4.2a3.4 3.4 0 0 0-.2-6l-.7-.3 1.1-.6a3.4 3.4 0 1 0-3.3-6Z" />
    <path d="m10.5 9.5 4 2.5-4 2.5Z" fill="currentColor" />
  </svg>
);

const ACTIVE = "#ff3d8b";

const Tab = ({ to, label, icon: Icon, end, isActive: forceActive }) => (
  <NavLink to={to} end={end} className="flex min-w-0 flex-1 flex-col items-center gap-1 pb-1 pt-2.5">
    {({ isActive: routeActive }) => {
      const active = forceActive ?? routeActive;
      return (
        <>
          <Icon
            className="h-7 w-7"
            strokeWidth={1.7}
            style={active ? { color: ACTIVE, fill: "rgba(255,61,139,0.85)", filter: "drop-shadow(0 0 8px rgba(255,61,139,0.6))" } : undefined}
          />
          <span
            className="truncate text-[11px] font-semibold uppercase tracking-wide min-[380px]:text-xs"
            style={{ color: active ? ACTIVE : "#fff" }}
          >
            {label}
          </span>
        </>
      );
    }}
  </NavLink>
);

// Mobile/tablet bottom navigation from the design: Home, Live TV, a raised
// gradient Upload button, Shorts and For You (your account area).
const BottomNav = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const onShorts = pathname.startsWith("/shorts");
  const inAccount = /^\/(you|feed|playlist|login|register)/.test(pathname);

  return (
    <nav className={`fixed inset-x-0 bottom-0 z-40 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden ${onShorts ? "bg-black" : ""}`}>
      <div
        className={`relative mx-auto flex max-w-xl items-end rounded-[26px] border shadow-[0_-4px_24px_rgba(0,0,0,0.5)] backdrop-blur ${
          onShorts ? "border-white/10 bg-black/90" : "border-white/15 bg-[#0d1220]/95"
        }`}
      >
        <Tab to="/" end label="Home" icon={House} />
        <Tab to="/live-tv" label="Live TV" icon={Tv} />

        <div className="flex min-w-0 flex-1 flex-col items-center pb-1">
          <StudioLink
            to="/upload"
            aria-label="Upload"
            className="-mt-7 flex h-[60px] w-[60px] items-center justify-center rounded-full border-[3px] border-[#0d1220] bg-gradient-to-br from-[#ff2d8b] via-[#d61fd0] to-[#7c3aed] text-white shadow-[0_0_22px_rgba(214,31,208,0.65)] transition active:scale-95"
          >
            <Plus className="h-8 w-8" strokeWidth={3} />
          </StudioLink>
          <span
            className="mt-1 text-[11px] font-semibold uppercase tracking-wide min-[380px]:text-xs"
            style={{ color: "#fff" }}
          >
            Upload
          </span>
        </div>

        <Tab to="/shorts" label="Shorts" icon={ShortsIcon} />
        <Tab to={user ? "/you" : "/login"} label="For You" icon={UserRound} isActive={inAccount} />
      </div>
    </nav>
  );
};

export default BottomNav;
