import React from "react";
import { NavLink, useNavigate } from "react-router";
import { ChevronRight, Crown, ExternalLink, Heart, LogIn, LogOut, Play } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { Avatar, IconTile, Logo } from "../ui/ui";
import { BROWSE_MENU, CREATOR_MENU, SETTINGS_MENU } from "../../utils/menu";
import { channelPath } from "../../utils/format";
import StudioLink from "../StudioLink/StudioLink";
import { openStudio } from "../../utils/handoff";

const MenuLink = ({ item, onNavigate, compact }) =>
  item.studio ? (
    <StudioLink to={item.to} onClick={onNavigate} className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-white/5">
      <IconTile
        icon={item.icon}
        color={item.color}
        gradient={item.gradient}
        size={compact ? "h-9 w-9" : "h-10 w-10"}
        iconSize={compact ? "h-[18px] w-[18px]" : "h-5 w-5"}
      />
      <span className="flex-1 truncate text-[15px] font-medium text-white">{item.label}</span>
      <ExternalLink className="h-4 w-4 text-muted" />
    </StudioLink>
  ) : (
  <NavLink
    to={item.to}
    end={item.end}
    onClick={onNavigate}
    className={({ isActive }) =>
      `group flex items-center gap-3 rounded-xl px-2.5 py-2 transition ${isActive ? "rgb-active" : "hover:bg-white/5"}`
    }
  >
    <IconTile
      icon={item.icon}
      color={item.color}
      gradient={item.gradient}
      size={compact ? "h-9 w-9" : "h-10 w-10"}
      iconSize={compact ? "h-[18px] w-[18px]" : "h-5 w-5"}
    />
    <span className="flex-1 truncate text-[15px] font-medium text-white">{item.label}</span>
    <ChevronRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5" />
  </NavLink>
  );

const ProfileCard = ({ onNavigate }) => {
  const { user, channel } = useAuth();
  const navigate = useNavigate();
  const go = (to) => {
    onNavigate?.();
    navigate(to);
  };

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => go("/login")}
        className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-brand/25 bg-gradient-to-br from-brand/25 to-brand-2/10 p-4 text-left"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white">
          <LogIn className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-white">Sign in</span>
          <span className="block text-xs text-muted">Like videos, comment, subscribe and upload</span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted" />
      </button>
    );
  }

  if (!channel) {
    return (
      <div className="rounded-2xl border border-brand/20 bg-gradient-to-br from-[#3a0d1f] to-card p-4">
        <div className="flex items-center gap-3">
          <Avatar src={user.avatar} name={user.name} size="h-12 w-12" ring={false} />
          <span className="min-w-0">
            <span className="block truncate font-bold text-white">{user.name}</span>
            <span className="block truncate text-xs text-muted">{user.email || user.phone}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            openStudio("/channel/create");
          }}
          className="bg-brand-gradient mt-3 w-full cursor-pointer rounded-xl py-2.5 text-sm font-semibold text-white"
        >
          Create your channel
        </button>
      </div>
    );
  }

  return (
    <NavLink
      to={channelPath(channel)}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-2xl border border-brand/20 bg-gradient-to-br from-[#3a0d1f] to-card p-4"
    >
      <Avatar src={channel.avatar} name={channel.name} size="h-14 w-14" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-bold text-white">{channel.name}</span>
        <span className="block truncate text-sm text-muted">@{channel.handle}</span>
        <span className="block text-xs text-slate-300">View your channel</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted" />
    </NavLink>
  );
};

// The menu shared by the mobile drawer and the desktop sidebar.
const NavMenu = ({ onNavigate, showBrowse = false }) => {
  const { user, channel, logout } = useAuth();
  const navigate = useNavigate();

  const creatorMenu = CREATOR_MENU.map((item) =>
    item.to === "__channel__" ? channel ? { ...item, to: channelPath(channel) } : user ? { ...item, to: "/channel/create", studio: true } : { ...item, to: "/login" } : item,
  );

  return (
    <div className="flex min-h-full flex-col gap-4 [&>*]:shrink-0">
      <ProfileCard onNavigate={onNavigate} />

      {showBrowse && (
        <nav className="space-y-1">
          {BROWSE_MENU.map((item) => (
            <MenuLink key={item.to} item={item} onNavigate={onNavigate} compact />
          ))}
        </nav>
      )}

      {showBrowse && <div className="h-px bg-line" />}

      <nav className="space-y-1">
        {showBrowse && <p className="px-2 pb-1 text-sm font-medium text-muted">Creator</p>}
        {creatorMenu.map((item) => (
          <MenuLink key={item.label} item={item} onNavigate={onNavigate} compact={showBrowse} />
        ))}
      </nav>

      <div className="h-px bg-line" />

      <nav className="space-y-1">
        <p className="px-2 pb-1 text-sm font-medium text-muted">Settings</p>
        {SETTINGS_MENU.map((item) => (
          <MenuLink key={item.to} item={item} onNavigate={onNavigate} compact={showBrowse} />
        ))}
      </nav>

      {user && (
        <>
          <div className="h-px bg-line" />
          <button
            type="button"
            onClick={() => {
              logout();
              onNavigate?.();
              navigate("/");
            }}
            className="group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/5"
          >
            <IconTile icon={LogOut} gradient={["#fca5a5", "#dc2626"]} size={showBrowse ? "h-9 w-9" : "h-10 w-10"} iconSize={showBrowse ? "h-[18px] w-[18px]" : "h-5 w-5"} />
            <span className="flex-1 text-[15px] font-medium text-live">Logout</span>
            <ChevronRight className="h-4 w-4 text-muted" />
          </button>
        </>
      )}

      <div className="relative mt-2 overflow-hidden rounded-2xl border border-brand/30 bg-gradient-to-br from-card-2 to-[#2a0f2a] p-4">
        <Play className="absolute -right-3 top-1/2 h-20 w-20 -translate-y-1/2 fill-brand-2/40 text-transparent" />
        <div className="relative flex items-start gap-3">
          <Crown className="h-8 w-8 shrink-0 fill-amber-400 text-amber-400" />
          <div>
            <p className="font-bold text-white">Create. Share. Earn.</p>
            <p className="mt-1 text-xs text-slate-300">Turn your videos into income with PipraTube</p>
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between px-1 pb-2 text-xs text-muted">
        <span>PipraTube v1.0.0</span>
        <span className="flex items-center gap-1.5 text-right">
          Watch Together
          <br />
          Grow Together
          <Heart className="h-5 w-5 fill-live text-live" />
        </span>
      </div>

      {!showBrowse && (
        <div className="flex justify-center pb-2 opacity-60">
          <Logo className="h-7" />
        </div>
      )}
    </div>
  );
};

export default NavMenu;
