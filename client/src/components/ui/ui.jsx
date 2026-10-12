import React, { useState } from "react";
import { Link } from "react-router";
import { ChevronRight, Eye, EyeOff, Info, Loader2 } from "lucide-react";

import logo from "../../assets/pipratube-logo.webp";
import icon from "../../assets/pipratube-icon.png";
import { useSiteSettings } from "../../hooks/useSiteSettings";

// Small building blocks shared by every page of the new design.

// The admin-uploaded logo (Site settings) when there is one, otherwise the
// brand mark bundled with the app.
export const Logo = ({ className = "h-9" }) => {
  const { settings } = useSiteSettings();
  const src = settings?.logo || logo;

  return (
    <img
      src={src}
      alt={settings?.siteName || "PipraTube"}
      draggable={false}
      className={`w-auto select-none object-contain ${className}`}
    />
  );
};

// Just the ant icon (the site favicon) — for small round spots where the
// full logo with its wordmark would be unreadable.
export const LogoMark = ({ className = "h-9" }) => {
  const { settings } = useSiteSettings();
  return <img src={settings?.favicon || icon} alt="" draggable={false} className={`w-auto select-none object-contain ${className}`} />;
};

export const SectionHeader = ({ title, to, action = "See All", className = "" }) => (
  <div className={`mb-3 flex items-center justify-between gap-3 ${className}`}>
    <h2 className="truncate text-lg font-bold text-white sm:text-xl">{title}</h2>
    {to && (
      <Link
        to={to}
        className="flex shrink-0 items-center gap-1 text-sm font-medium text-muted transition hover:text-white"
      >
        {action}
        <ChevronRight className="h-4 w-4" />
      </Link>
    )}
  </div>
);

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted sm:text-base">{subtitle}</p>}
    </div>
    {children}
  </div>
);

export const Card = ({ className = "", children, ...rest }) => (
  <div className={`rounded-2xl border border-line bg-card ${className}`} {...rest}>
    {children}
  </div>
);

// Pill-shaped filter chips — the "All / Movies / Drama ..." rows.
export const Chips = ({ items, value, onChange, className = "" }) => (
  <div className={`no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0 ${className}`}>
    {items.map((item) => {
      const active = item.value === value;
      return (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`shrink-0 cursor-pointer rounded-xl px-4 py-2 text-sm font-medium transition ${
            active
              ? "bg-live text-white shadow-lg shadow-live/25"
              : "border border-line bg-card-2 text-slate-200 hover:bg-white/10"
          }`}
        >
          {item.label}
        </button>
      );
    })}
  </div>
);

// Icon in a rounded, tinted square — the colourful menu/stat icons.
export const IconTile = ({ icon: Icon, color, gradient, size = "h-11 w-11", iconSize = "h-5 w-5", solid = true }) => (
  <span
    className={`flex shrink-0 items-center justify-center rounded-xl ${gradient ? "icon-tile" : ""} ${size}`}
    style={
      gradient
        ? { background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`, color: "#fff", "--tile-glow": `${gradient[1]}aa` }
        : { background: solid ? color : `${color}26`, color: solid ? "#fff" : color }
    }
  >
    <Icon className={`relative z-[1] drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)] ${iconSize}`} />
  </span>
);

export const Spinner = ({ className = "" }) => (
  <div className={`flex items-center justify-center py-16 text-muted ${className}`}>
    <Loader2 className="h-7 w-7 animate-spin" />
  </div>
);

export const EmptyState = ({ icon: Icon = Info, title, text, children }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
    <Icon className="h-10 w-10 text-muted" />
    <p className="mt-3 font-semibold text-white">{title}</p>
    {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
    {children && <div className="mt-4">{children}</div>}
  </div>
);

// Marks numbers that don't come from the server yet (earnings, likes,
// subscribers ...) so nobody mistakes them for real figures.
export const PreviewNotice = ({ children = "Some numbers on this page are preview data until this feature goes live." }) => (
  <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-200 sm:text-sm">
    <Info className="mt-0.5 h-4 w-4 shrink-0" />
    <span>{children}</span>
  </div>
);

export const PrimaryButton = ({ className = "", children, ...rest }) => (
  <button
    className={`bg-brand-gradient inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-white shadow-lg shadow-brand/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    {...rest}
  >
    {children}
  </button>
);

export const GhostButton = ({ className = "", children, ...rest }) => (
  <button
    className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-card-2 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    {...rest}
  >
    {children}
  </button>
);

// Round avatar with the brand ring used for channels and the creator.
export const Avatar = ({ src, name, size = "h-12 w-12", ring = true }) => (
  <span
    className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-black ${size} ${
      ring ? "ring-2 ring-brand ring-offset-2 ring-offset-page" : ""
    }`}
  >
    {src ? (
      <img src={src} alt={name || ""} className="h-full w-full object-cover" draggable={false} />
    ) : (
      <span className="text-sm font-bold uppercase text-brand">{(name || "P").slice(0, 2)}</span>
    )}
  </span>
);

export const Field = ({ label, icon: Icon, required, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm text-muted">
      {label}
      {required && <span className="ml-0.5 text-brand">*</span>}
    </span>
    <span className="flex items-center gap-3 rounded-xl border border-white/15 bg-black/20 px-3 focus-within:border-brand/70">
      {Icon && <Icon className="h-5 w-5 shrink-0 text-muted" />}
      {children}
    </span>
  </label>
);

export const inputClass =
  "h-12 w-full min-w-0 bg-transparent text-white outline-none placeholder:text-slate-500 [color-scheme:dark]";

// A password input with a show/hide eye — goes inside <Field>.
export const PasswordInput = (props) => {
  const [show, setShow] = useState(false);
  return (
    <>
      <input {...props} type={show ? "text" : "password"} className={inputClass} />
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          setShow((value) => !value);
        }}
        className="-mr-1 shrink-0 cursor-pointer rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-white"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </>
  );
};
