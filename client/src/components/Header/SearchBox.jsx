import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { History, Search, X } from "lucide-react";

import { api } from "../../api/axios";
import { channelPath } from "../../utils/format";

// YouTube's search box: on focus it lists your recent searches (🕘, with ✕
// to forget one); while typing it adds suggestions from titles and
// channels, with a thumbnail on the right. ↑/↓ walk the list, Enter
// searches, Esc closes.

const HISTORY_KEY = "pipra_search_history";
const HISTORY_MAX = 30;

const readHistory = () => {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(list) ? list.filter((item) => typeof item?.q === "string") : [];
  } catch {
    return [];
  }
};

const writeHistory = (list) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {
    // Private mode — history just isn't kept.
  }
};

const SearchBox = ({ autoFocus, onDone }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const urlQuery = location.pathname === "/search" ? new URLSearchParams(location.search).get("q") || "" : "";
  const [query, setQuery] = useState(urlQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [history, setHistory] = useState(readHistory);
  const [remote, setRemote] = useState({ q: "", suggestions: [], channels: [] });
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  // Follow the address bar (back/forward, a search from elsewhere).
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  const typed = query.trim().toLowerCase();

  useEffect(() => {
    if (!typed) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .get("/api/videos/suggest", { params: { q: typed }, signal: controller.signal })
        .then(({ data }) => setRemote({ q: typed, suggestions: data?.data?.suggestions || [], channels: data?.data?.channels || [] }))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typed]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => !boxRef.current?.contains(event.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  // The rows: matching history first, then suggestions, then channels.
  const pastMatches = typed ? history.filter((item) => item.q.toLowerCase().includes(typed)).slice(0, 5) : history.slice(0, 14);
  const fresh = typed && remote.q === typed ? remote : { suggestions: [], channels: [] };
  const taken = new Set(pastMatches.map((item) => item.q.toLowerCase()));
  const items = [
    ...pastMatches.map((item) => ({ kind: "history", text: item.q, thumbnail: item.thumb })),
    ...fresh.suggestions.filter((s) => !taken.has(s.text)).map((s) => ({ kind: "suggestion", text: s.text, thumbnail: s.thumbnail })),
    ...fresh.channels.map((c) => ({ kind: "channel", text: c.name, thumbnail: c.avatar, channel: c })),
  ].slice(0, 14);

  const go = (text, thumbnail) => {
    const q = text.trim();
    if (!q) return;
    const thumb = thumbnail ?? fresh.suggestions[0]?.thumbnail ?? history.find((item) => item.q.toLowerCase() === q.toLowerCase())?.thumb ?? null;
    const next = [{ q, thumb }, ...history.filter((item) => item.q.toLowerCase() !== q.toLowerCase())];
    setHistory(next);
    writeHistory(next);
    setQuery(q);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    navigate(`/search?q=${encodeURIComponent(q)}`);
    onDone?.();
  };

  const pick = (item) => {
    if (item.kind === "channel") {
      setOpen(false);
      navigate(channelPath(item.channel));
      onDone?.();
      return;
    }
    go(item.text, item.thumbnail);
  };

  const forget = (text) => {
    const next = history.filter((item) => item.q !== text);
    setHistory(next);
    writeHistory(next);
    setActive(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!items.length) return;
    setOpen(true);
    setActive((index) => {
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = index + step;
      return next < -1 ? items.length - 1 : next >= items.length ? -1 : next;
    });
  };

  const submit = (event) => {
    event.preventDefault();
    if (active >= 0 && items[active]) pick(items[active]);
    else go(query);
  };

  // While walking the list with the arrows the box shows that row, as on YouTube.
  const shown = active >= 0 && items[active] && items[active].kind !== "channel" ? items[active].text : query;
  const showList = open && items.length > 0;

  return (
    <div ref={boxRef} className="relative w-full min-w-0">
      <form onSubmit={submit} className="flex h-11 w-full items-stretch">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-l-full border border-line bg-card-2 pl-4 pr-1 focus-within:border-[#3ea6ff]/70">
          <Search className="h-5 w-5 shrink-0 text-muted" />
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            value={shown}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showList}
            aria-controls="search-suggestions"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-slate-500"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setActive(-1);
                setOpen(true);
                inputRef.current?.focus();
              }}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <button type="submit" aria-label="Search" className="flex w-12 shrink-0 cursor-pointer items-center justify-center rounded-r-full border border-l-0 border-line bg-white/[0.08] hover:bg-white/15 sm:w-16">
          <Search className="h-5 w-5" />
        </button>
      </form>

      {showList && (
        <ul id="search-suggestions" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[75vh] overflow-y-auto rounded-xl border border-line bg-card py-3 shadow-2xl shadow-black/60 sm:right-16">
          {items.map((item, index) => (
            <li
              key={`${item.kind}:${item.text}`}
              role="option"
              aria-selected={index === active}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => pick(item)}
              onPointerEnter={() => setActive(index)}
              className={`group flex cursor-pointer items-center gap-3 py-1.5 pl-4 pr-2 ${index === active ? "bg-white/10" : ""}`}
            >
              {item.kind === "history" ? (
                <History className="h-5 w-5 shrink-0 text-white/80" />
              ) : item.kind === "channel" ? (
                <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-black">{item.thumbnail && <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />}</span>
              ) : (
                <Search className="h-5 w-5 shrink-0 text-white/80" />
              )}
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">{item.text}</span>
              {item.kind !== "channel" && item.thumbnail && <img src={item.thumbnail} alt="" className="h-7 w-12 shrink-0 rounded object-cover" loading="lazy" />}
              {item.kind === "history" && (
                <button
                  type="button"
                  aria-label={`Remove "${item.text}" from history`}
                  onClick={(event) => {
                    event.stopPropagation();
                    forget(item.text);
                  }}
                  className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-white/10 hover:text-white ${
                    index === active ? "opacity-100" : "[@media(hover:hover)]:opacity-0"
                  }`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchBox;
