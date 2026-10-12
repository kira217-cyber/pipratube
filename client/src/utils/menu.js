import {
  BarChart3,
  CircleDollarSign,
  Clapperboard,
  History,
  House,
  Library,
  LayoutDashboard,
  Palette,
  Play,
  Rss,
  Settings,
  ShieldCheck,
  Tv,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

// Everything a viewer can browse — shown in the desktop sidebar (the
// bottom nav covers the same ground on mobile).
export const BROWSE_MENU = [
  { label: "Home", to: "/", icon: House, color: "#3b82f6", end: true, gradient: ["#60a5fa", "#2563eb"] },
  { label: "Live TV", to: "/live-tv", icon: Tv, color: "#e3172f", gradient: ["#fb7185", "#e11d48"] },
  { label: "Shorts", to: "/shorts", icon: Clapperboard, color: "#a855f7", gradient: ["#e879f9", "#9333ea"] },
  { label: "Videos", to: "/videos", icon: Play, color: "#22c55e", gradient: ["#4ade80", "#16a34a"] },
  { label: "Subscriptions", to: "/feed/subscriptions", icon: Rss, color: "#f97316", gradient: ["#fdba74", "#ea580c"] },
  { label: "You", to: "/you", icon: Library, color: "#6366f1", gradient: ["#a5b4fc", "#4f46e5"] },
  { label: "History", to: "/feed/history", icon: History, color: "#64748b", gradient: ["#94a3b8", "#475569"] },
  { label: "Channels", to: "/channels", icon: Users, color: "#0ea5e9", gradient: ["#67e8f9", "#0284c7"] },
];

// The creator menu from the drawer design — these open PipraTube Studio
// (studio: true). "View Chanel" is filled in
// at render time with the signed-in creator's own channel id.
export const CREATOR_MENU = [
  { label: "Dashboard", to: "/", studio: true, icon: LayoutDashboard, color: "#ff2d6f", end: true, gradient: ["#ff7aa2", "#e11d74"] },
  { label: "Content", to: "/videos", studio: true, icon: Play, color: "#7c3aed", gradient: ["#c4b5fd", "#7c3aed"] },
  { label: "Your channel", to: "__channel__", icon: Users, color: "#2f86e6", gradient: ["#7dd3fc", "#2563eb"] },
  { label: "Analytics", to: "/analytics", studio: true, icon: BarChart3, color: "#16a34a", gradient: ["#86efac", "#15803d"] },
  { label: "Earning", to: "/earning", studio: true, icon: CircleDollarSign, color: "#d97706", gradient: ["#fde047", "#d97706"] },
];

export const SETTINGS_MENU = [
  { label: "Customize channel", to: "/customize", studio: true, icon: Palette, color: "#db2777", gradient: ["#f9a8d4", "#be185d"] },
  { label: "Account", to: "/profile", studio: true, icon: UserRound, color: "#2f86e6", gradient: ["#93c5fd", "#1d4ed8"] },
  { label: "Verified Identity", to: "/verify", studio: true, icon: ShieldCheck, color: "#16a34a", gradient: ["#6ee7b7", "#047857"] },
  { label: "Payout information", to: "/payout", studio: true, icon: Wallet, color: "#7c3aed", gradient: ["#d8b4fe", "#6d28d9"] },
  { label: "Billing & payment", to: "/billing", studio: true, icon: Settings, color: "#d97706", gradient: ["#fcd34d", "#b45309"] },
];

