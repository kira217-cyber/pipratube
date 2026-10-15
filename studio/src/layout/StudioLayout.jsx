import React, { Suspense, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import {
  BarChart3,
  CircleDollarSign,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  Play,
  Plus,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
} from "lucide-react";

import { Avatar, IconTile, Logo, Spinner } from "../components/ui/ui";
import { useAuth } from "../context/AuthContext";
import { openSite } from "../utils/handoff";
import { SITE_URL } from "../api/axios";
import NotificationBell from "../components/NotificationBell";
import TopProgress from "../components/TopProgress";

// YouTube Studio's shape: a channel card and menu on the left, the page on
// the right; on phones a bottom bar with a big Create button in the middle.

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, gradient: ["#ff7aa2", "#e11d74"], end: true },
  { to: "/videos", label: "Content", icon: Play, gradient: ["#c4b5fd", "#7c3aed"] },
  { to: "/analytics", label: "Analytics", icon: BarChart3, gradient: ["#86efac", "#15803d"] },
  { to: "/earning", label: "Earn", icon: CircleDollarSign, gradient: ["#fde047", "#d97706"] },
  { to: "/customize", label: "Customization", icon: Palette, gradient: ["#f9a8d4", "#be185d"] },
  { to: "/verify", label: "Verification", icon: ShieldCheck, gradient: ["#6ee7b7", "#047857"] },
  { to: "/profile", label: "Account", icon: UserRound, gradient: ["#93c5fd", "#1d4ed8"] },
  { to: "/payout", label: "Payout", icon: Wallet, gradient: ["#d8b4fe", "#6d28d9"] },
];

const BOTTOM = [NAV[0], NAV[1], null, NAV[2], NAV[3]]; // null = the Create button

const Sidebar = ({ onNavigate }) => {
  const { channel, user } = useAuth();
  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="flex flex-col items-center rounded-2xl border border-brand/20 bg-gradient-to-br from-[#3a0d1f] to-card px-4 py-5 text-center">
        <Avatar src={channel?.avatar || user?.avatar} name={channel?.name || user?.name || "P"} size="h-20 w-20" />
        <p className="mt-3 text-xs text-muted">{channel ? "Your channel" : "Your account"}</p>
        <p className="w-full truncate font-bold">{channel?.name || user?.name}</p>
        {channel && <p className="w-full truncate text-xs text-muted">@{channel.handle}</p>}
      </div>

      <nav className="space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-2.5 py-2 transition ${isActive ? "rgb-active" : "hover:bg-white/5"}`}
          >
            <IconTile icon={item.icon} gradient={item.gradient} size="h-9 w-9" iconSize="h-[18px] w-[18px]" />
            <span className="flex-1 truncate text-[15px] font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="h-px bg-line" />
      <button
        type="button"
        onClick={() => openSite(channel ? `/@${channel.handle}` : "/")}
        className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm text-slate-300 hover:bg-white/5"
      >
        <IconTile icon={ExternalLink} gradient={["#94a3b8", "#475569"]} size="h-9 w-9" iconSize="h-[18px] w-[18px]" />
        View on PipraTube
      </button>
    </div>
  );
};

const AccountMenu = () => {
  const { user, channel, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Account menu" className="cursor-pointer rounded-full">
        <Avatar src={channel?.avatar || user.avatar} name={channel?.name || user.name} size="h-9 w-9" ring={false} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-line bg-card shadow-2xl">
            <div className="flex items-center gap-3 border-b border-line p-4">
              <Avatar src={channel?.avatar || user.avatar} name={channel?.name || user.name} size="h-11 w-11" ring={false} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{channel?.name || user.name}</p>
                <p className="truncate text-xs text-muted">{channel ? `@${channel.handle}` : user.email || user.phone}</p>
              </div>
            </div>
            {[
              channel && { label: "Your channel", icon: ExternalLink, run: () => openSite(`/@${channel.handle}`) },
              { label: "PipraTube", icon: Play, run: () => openSite("/") },
              { label: "Account", icon: UserRound, run: () => navigate("/profile") },
              {
                label: "Sign out",
                icon: LogOut,
                run: () => {
                  logout();
                  navigate("/login");
                },
              },
            ]
              .filter(Boolean)
              .map(({ label, icon: Icon, run }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    run();
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5"
                >
                  <Icon className="h-[18px] w-[18px] text-muted" /> {label}
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
};

const StudioLayout = () => {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const onUpload = location.pathname === "/upload";

  return (
    <div className="min-h-screen bg-page text-white">
      <TopProgress />
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-2 border-b border-line bg-header/95 px-2 backdrop-blur sm:px-4 lg:px-6">
        <button type="button" aria-label="Open menu" onClick={() => setDrawer(true)} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full hover:bg-white/10 lg:hidden">
          <Menu className="h-6 w-6" />
        </button>
        {/* The logo goes back to the main site (pipratube.com), still signed in. */}
        <a
          href={SITE_URL}
          onClick={(event) => {
            event.preventDefault();
            openSite("/");
          }}
          aria-label="Go to PipraTube"
          className="flex min-w-0 items-center gap-2"
        >
          <Logo className="h-9 sm:h-11" />
          <span className="rounded-md bg-brand/20 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-brand sm:text-xs">STUDIO</span>
        </a>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link to="/upload" className="hidden items-center gap-1.5 rounded-xl border border-line bg-card-2 px-4 py-2 text-sm font-semibold hover:bg-white/10 sm:flex">
            <Plus className="h-5 w-5 text-brand" /> Create
          </Link>
          <NotificationBell />
          <AccountMenu />
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-16 hidden w-64 overflow-y-auto border-r border-line bg-header px-3 py-4 lg:block">
        <Sidebar />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[84%] max-w-xs overflow-y-auto bg-header px-3 pb-6 pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl">
            <div className="mb-3 flex items-center justify-between px-1">
              <a
                href={SITE_URL}
                onClick={(event) => {
                  event.preventDefault();
                  openSite("/");
                }}
                aria-label="Go to PipraTube"
              >
                <Logo className="h-8" />
              </a>
              <button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <main className={`pt-16 lg:pl-64 ${onUpload ? "" : "pb-24 lg:pb-8"}`}>
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <Suspense fallback={<Spinner className="min-h-[50vh]" />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {!onUpload && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-header/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden">
          <div className="flex items-end justify-around">
            {BOTTOM.map((item) =>
              item ? (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex w-16 flex-col items-center gap-0.5 py-1 text-[11px] font-medium ${isActive ? "text-white" : "text-muted"}`}>
                  {({ isActive }) => (
                    <>
                      <span className={`rounded-xl p-1 ${isActive ? "rgb-active" : ""}`}>
                        <IconTile icon={item.icon} gradient={isActive ? item.gradient : ["#2a313b", "#1b2129"]} size="h-8 w-8" iconSize="h-[17px] w-[17px]" />
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              ) : (
                <Link key="create" to="/upload" aria-label="Upload" className="bg-brand-gradient -mt-5 flex h-14 w-14 items-center justify-center rounded-full shadow-lg shadow-brand/30 ring-4 ring-header">
                  <Plus className="h-7 w-7" strokeWidth={2.5} />
                </Link>
              ),
            )}
          </div>
        </nav>
      )}
    </div>
  );
};

export default StudioLayout;
