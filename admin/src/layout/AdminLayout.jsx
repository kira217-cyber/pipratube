import React, { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import {
  Activity,
  Clapperboard,
  ExternalLink,
  Flag,
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Layers,
  Menu,
  MessageSquare,
  Radio,
  Settings,
  ShieldCheck,
  Tv,
  Users,
  UsersRound,
  X,
} from "lucide-react";

import { Avatar, Logo, Spinner } from "../components/ui";
import TopProgress from "../components/TopProgress";
import { useAdmin } from "../AdminAuth";
import { SITE_URL } from "../api/client";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard", end: true },
  { to: "/analytics", label: "Live analytics", icon: Activity, perm: "dashboard" },
  { to: "/videos", label: "Videos", icon: Clapperboard, perm: "videos" },
  { to: "/users", label: "Users", icon: Users, perm: "users" },
  { to: "/channels", label: "Channels", icon: UsersRound, perm: "channels" },
  { to: "/comments", label: "Comments", icon: MessageSquare, perm: "comments" },
  { to: "/reports", label: "Reports", icon: Flag, perm: "videos" },
  { to: "/home", label: "Home page", icon: Home, perm: "home" },
  { to: "/ads", label: "Ads", icon: Megaphone, perm: "ads" },
  { to: "/live-tv", label: "Live TV", icon: Tv, perm: "live-tv", end: true },
  { to: "/live-tv/pipra", label: "Pipra TV channel", icon: Radio, perm: "live-tv" },
  { to: "/live-tv/overlays", label: "Live TV overlays", icon: Layers, perm: "live-tv" },
  { to: "/settings", label: "Site settings", icon: Settings, perm: "settings" },
  { to: "/admins", label: "Admins", icon: ShieldCheck, perm: "__super" },
];

const SideNav = ({ onNavigate }) => {
  const { admin, can, logout } = useAdmin();
  const items = NAV.filter((item) => (item.perm === "__super" ? admin?.role === "super" : can(item.perm)));
  return (
    <div className="flex h-full flex-col">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2 px-2 py-1">
        <Logo className="h-9" />
        <span className="rounded-md bg-brand/20 px-2 py-0.5 text-xs font-bold text-brand">ADMIN</span>
      </Link>
      <nav className="mt-6 flex-1 space-y-1">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-brand/20 text-white ring-1 ring-brand/30" : "text-slate-300 hover:bg-white/5 hover:text-white"}`
            }
          >
            <Icon className="h-5 w-5" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t border-line pt-3">
        <a href={SITE_URL} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
          <ExternalLink className="h-5 w-5" /> Open site
        </a>
        <NavLink to="/account" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
          <KeyRound className="h-5 w-5" /> Account
        </NavLink>
        <button type="button" onClick={logout} className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#f87171] hover:bg-white/5">
          <LogOut className="h-5 w-5" /> Sign out
        </button>
      </div>
    </div>
  );
};

const AdminLayout = () => {
  const { admin } = useAdmin();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-page text-white">
      <TopProgress />
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-header p-4 lg:block">
        <SideNav />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-header p-4">
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-3 top-3 cursor-pointer rounded-full p-1.5 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
            <SideNav onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-header/95 px-4 backdrop-blur lg:px-8">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="cursor-pointer rounded-full p-1.5 hover:bg-white/10 lg:hidden">
            <Menu className="h-6 w-6" />
          </button>
          <span className="lg:hidden">
            <Logo className="h-8" />
          </span>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{admin?.name}</p>
              <p className="text-xs text-muted">{admin?.role === "super" ? "Main admin" : "Admin"}</p>
            </div>
            <Avatar name={admin?.name || "A"} size="h-9 w-9" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
          <Suspense fallback={<Spinner className="min-h-[50vh]" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
