import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Search, Upload, X } from "lucide-react";

// Small admin-only building blocks (tables, modals, toggles, filters).

export const Modal = ({ title, onClose, children, wide = false, footer }) => {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-card sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <p className="text-lg font-bold">{title}</p>
          <button type="button" aria-label="Close" onClick={onClose} className="cursor-pointer rounded-full p-1.5 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
};

export const Toggle = ({ on, onChange, label, disabled }) => (
  <label className={`inline-flex items-center gap-2 text-sm ${disabled ? "opacity-50" : "cursor-pointer"}`}>
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition disabled:cursor-not-allowed ${on ? "bg-[#22c55e]" : "bg-white/15"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
    {label && <span>{label}</span>}
  </label>
);

export const SearchInput = ({ value, onChange, placeholder = "Search…" }) => (
  <label className="flex h-11 min-w-0 flex-1 basis-full items-center gap-2 rounded-xl border border-line bg-card px-3 sm:max-w-xs sm:basis-auto">
    <Search className="h-4 w-4 shrink-0 text-muted" />
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
  </label>
);

export const Select = ({ value, onChange, options, className = "" }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`h-11 cursor-pointer rounded-xl border border-line bg-card px-3 text-sm text-white outline-none [color-scheme:dark] ${className}`}
  >
    {options.map(([v, label]) => (
      <option key={v} value={v}>
        {label}
      </option>
    ))}
  </select>
);

export const Pager = ({ page, totalPages, onPage }) =>
  totalPages > 1 ? (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line disabled:opacity-40">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-muted">
        Page {page} of {totalPages}
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line disabled:opacity-40">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  ) : null;

export const Badge = ({ tone = "gray", children }) => {
  const tones = {
    gray: "bg-white/10 text-slate-300",
    green: "bg-[#22c55e]/15 text-[#4ade80]",
    red: "bg-live/15 text-[#f87171]",
    blue: "bg-[#2f86e6]/15 text-[#60a5fa]",
    purple: "bg-[#a855f7]/15 text-[#c084fc]",
    amber: "bg-amber-400/15 text-amber-300",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
};

export const TextInput = ({ label, hint, ...rest }) => (
  <label className="block">
    {label && <span className="mb-1.5 block text-sm text-muted">{label}</span>}
    <input {...rest} className="h-11 w-full rounded-xl border border-white/15 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand/70 [color-scheme:dark]" />
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
);

// Password field with a show/hide eye button.
export const PasswordInput = ({ label, hint, ...rest }) => {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm text-muted">{label}</span>}
      <span className="relative block">
        <input {...rest} type={show ? "text" : "password"} className="h-11 w-full rounded-xl border border-white/15 bg-black/20 pl-3 pr-11 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand/70" />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            setShow((v) => !v);
          }}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-white"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
};

export const TextArea = ({ label, ...rest }) => (
  <label className="block">
    {label && <span className="mb-1.5 block text-sm text-muted">{label}</span>}
    <textarea {...rest} className="w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand/70" />
  </label>
);

export const Btn = ({ tone = "ghost", className = "", children, ...rest }) => {
  const tones = {
    ghost: "border border-line bg-card-2 hover:bg-white/10",
    primary: "bg-brand-gradient shadow-lg shadow-brand/20 hover:brightness-110",
    danger: "bg-live/85 hover:bg-live",
    plain: "hover:bg-white/10",
  };
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
};

// A file input that looks like the other fields: shows a placeholder until a
// file is chosen, then its name and size, with a button to clear it.
export const FilePicker = ({ accept, file, onChange, placeholder = "No file chosen", icon: Icon = Upload }) => (
  <div className="flex h-11 w-full items-center gap-2 rounded-xl border border-white/15 bg-black/20 pl-1.5 pr-2 text-sm">
    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-card-2 px-3 py-1.5 font-semibold hover:bg-white/10">
      <Icon className="h-4 w-4" /> Browse
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0] || null;
          e.target.value = "";
          if (picked) onChange(picked);
        }}
      />
    </label>
    <span className={`min-w-0 flex-1 truncate ${file ? "text-white" : "text-slate-500"}`}>
      {file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : placeholder}
    </span>
    {file && (
      <button type="button" onClick={() => onChange(null)} className="cursor-pointer rounded-full p-1 text-muted hover:bg-white/10 hover:text-white" aria-label="Remove file">
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
);
