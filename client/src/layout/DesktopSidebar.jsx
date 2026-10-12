import React from "react";
import { NavLink } from "react-router";
import { Upload } from "lucide-react";

import NavMenu from "../components/NavMenu/NavMenu";
import StudioLink from "../components/StudioLink/StudioLink";
import { IconTile } from "../components/ui/ui";
import { BROWSE_MENU } from "../utils/menu";

// Desktop sidebar, YouTube-style: a narrow column of icons, or the full menu.
// The ☰ button switches between them and the width animates, so the menu
// slides open and closed instead of popping in and out.

export const SIDEBAR_FULL = "18rem";
export const SIDEBAR_MINI = "5rem";

const MiniItem = ({ item }) => (
  <NavLink
    to={item.to}
    end={item.end}
    title={item.label}
    className={({ isActive }) =>
      `group flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition ${isActive ? "rgb-active" : "hover:bg-white/5"}`
    }
  >
    <IconTile icon={item.icon} color={item.color} gradient={item.gradient} size="h-9 w-9" iconSize="h-[18px] w-[18px]" />
    <span className="w-full truncate text-[10.5px] font-medium leading-tight text-slate-200">{item.label}</span>
  </NavLink>
);

const DesktopSidebar = ({ open }) => (
  <aside
    className="fixed bottom-0 left-0 top-16 z-30 hidden overflow-hidden border-r border-line bg-header transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] lg:block"
    style={{ width: open ? SIDEBAR_FULL : SIDEBAR_MINI }}
  >
    {/* Icon column — fades out as the full menu opens over it. */}
    <nav
      aria-hidden={open}
      className={`no-scrollbar absolute inset-y-0 left-0 flex w-20 flex-col gap-1 overflow-y-auto px-2 py-3 transition-opacity duration-200 ${
        open ? "pointer-events-none opacity-0" : "opacity-100 delay-100"
      }`}
    >
      {BROWSE_MENU.map((item) => (
        <MiniItem key={item.to} item={item} />
      ))}
      <StudioLink to="/upload" title="Upload" className="mt-1 flex flex-col items-center gap-1 rounded-xl px-1 py-2 hover:bg-white/5">
        <IconTile icon={Upload} gradient={["#ff9a1f", "#c026d3"]} size="h-9 w-9" iconSize="h-[18px] w-[18px]" />
        <span className="text-[10.5px] font-medium leading-tight text-slate-200">Upload</span>
      </StudioLink>
    </nav>

    {/* Full menu — fixed width, so its contents never squash while the
        sidebar is opening; it just slides into view. */}
    <div
      aria-hidden={!open}
      className={`no-scrollbar absolute inset-y-0 left-0 w-72 overflow-y-auto px-3 py-4 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
        open ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-6 opacity-0"
      }`}
    >
      <NavMenu showBrowse />
    </div>
  </aside>
);

export default DesktopSidebar;
