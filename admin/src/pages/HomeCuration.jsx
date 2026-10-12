import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Shuffle, Trash2, X } from "lucide-react";

import { Avatar, Card, PageHeader, Spinner } from "../components/ui";
import { Btn, Modal, SearchInput, Select, TextInput, Toggle } from "../components/kit";
import { apiError, get, send } from "../api/client";
import { toast } from "../utils/alerts";

const move = (list, index, delta) => {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

// Search-and-tick picker for videos / shorts / channels.
const Picker = ({ kind, chosen, onAdd, onClose }) => {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const url = kind === "channels" ? "/api/admin/site/pick/channels" : "/api/admin/site/pick/videos";
      get(url, { search: search || undefined, type: kind === "shorts" ? "shorts" : undefined })
        .then((d) => setItems(d.videos || d.channels))
        .catch(() => setItems([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [kind, search]);
  const taken = new Set(chosen.map((c) => c.id));

  return (
    <Modal title={kind === "channels" ? "Add channels" : kind === "shorts" ? "Add Shorts" : "Add videos"} onClose={onClose} wide footer={<Btn onClick={onClose}>Done</Btn>}>
      <SearchInput value={search} onChange={setSearch} placeholder="Search" />
      <div className="mt-3 space-y-2">
        {items === null ? (
          <Spinner className="py-6" />
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nothing found (only public videos can be featured).</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-line p-2">
              {kind === "channels" ? (
                <Avatar src={item.avatar} name={item.name} size="h-9 w-9" ring={false} />
              ) : (
                <div className="w-24 shrink-0 overflow-hidden rounded-md bg-card-2">{item.thumbnail && <img src={item.thumbnail} alt="" className="aspect-video w-full object-cover" />}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.title || item.name}</p>
                <p className="truncate text-xs text-muted">{item.channel?.name || `@${item.handle}`}</p>
              </div>
              <Btn disabled={taken.has(item.id)} onClick={() => onAdd(item)}>
                {taken.has(item.id) ? "Added" : "Add"}
              </Btn>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
};

const List = ({ items, onChange, render }) =>
  items.length === 0 ? (
    <p className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-muted">Nothing here yet.</p>
  ) : (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <li key={item.id} className="flex items-center gap-3 rounded-xl border border-line bg-card-2/40 p-2">
          <span className="w-5 text-center text-xs text-muted">{index + 1}</span>
          {render(item)}
          <div className="flex shrink-0 gap-1">
            <Btn tone="plain" onClick={() => onChange(move(items, index, -1))} disabled={index === 0} aria-label="Move up">
              <ArrowUp className="h-4 w-4" />
            </Btn>
            <Btn tone="plain" onClick={() => onChange(move(items, index, 1))} disabled={index === items.length - 1} aria-label="Move down">
              <ArrowDown className="h-4 w-4" />
            </Btn>
            <Btn tone="plain" onClick={() => onChange(items.filter((i) => i.id !== item.id))} aria-label="Remove">
              <X className="h-4 w-4" />
            </Btn>
          </div>
        </li>
      ))}
    </ol>
  );

const videoRow = (v) => (
  <>
    <div className="w-24 shrink-0 overflow-hidden rounded-md bg-card-2">{v.thumbnail && <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />}</div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold">{v.title}</p>
      <p className="truncate text-xs text-muted">{v.channel?.name}</p>
    </div>
  </>
);

const channelRow = (c) => (
  <>
    <Avatar src={c.avatar} name={c.name} size="h-9 w-9" ring={false} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold">{c.name}</p>
      <p className="truncate text-xs text-muted">@{c.handle}</p>
    </div>
  </>
);

const Block = ({ title, hint, onAdd, children }) => (
  <Card className="p-4">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="font-semibold">{title}</p>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {onAdd && (
        <Btn onClick={onAdd}>
          <Plus className="h-4 w-4" /> Add
        </Btn>
      )}
    </div>
    {children}
  </Card>
);

// What the client's Home shows first.
const HomeCuration = () => {
  const [home, setHome] = useState(null);
  const [picker, setPicker] = useState(null); // { kind, target }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get("/api/admin/site/home")
      .then((d) => setHome(d.home))
      .catch(() => setHome(false));
  }, []);

  if (home === null) return <Spinner className="min-h-[50vh]" />;
  if (home === false) return <p className="text-muted">Couldn't load Home settings.</p>;

  const setSection = (index, patch) => setHome((h) => ({ ...h, sections: h.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));

  const save = async () => {
    setBusy(true);
    try {
      const ids = (list) => list.map((x) => x.id);
      const data = await send("put", "/api/admin/site/home", {
        pinnedVideos: ids(home.pinnedVideos),
        pinnedShorts: ids(home.pinnedShorts),
        featuredChannels: ids(home.featuredChannels),
        sections: home.sections.map((s) => ({ title: s.title, enabled: s.enabled, videos: ids(s.videos) })),
        shuffleVideos: home.shuffleVideos,
        shuffleShorts: home.shuffleShorts,
        shortsEvery: home.shortsEvery,
      });
      setHome(data.home);
      toast.success("Home page saved");
    } catch (error) {
      toast.error(apiError(error, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };

  const pickerChosen = () => {
    if (!picker) return [];
    if (picker.target === "section") return home.sections[picker.index].videos;
    return home[picker.target];
  };

  const addPicked = (item) => {
    if (picker.target === "section") setSection(picker.index, { videos: [...home.sections[picker.index].videos, item] });
    else setHome((h) => ({ ...h, [picker.target]: [...h[picker.target], item] }));
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Home page" subtitle="Choose what viewers see first on Home">
        <Btn tone="primary" onClick={save} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save changes"}
        </Btn>
      </PageHeader>

      <Card className="p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Shuffle className="h-5 w-5 text-brand" /> Feed order
        </p>
        <p className="text-sm text-muted">Pinned videos and Shorts always come first; everything after them follows these settings.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-line p-3">
            <Toggle on={home.shuffleVideos} onChange={(v) => setHome((h) => ({ ...h, shuffleVideos: v }))} label="Shuffle videos" />
            <p className="mt-1.5 text-xs text-muted">{home.shuffleVideos ? "A new order on every visit — no fixed first or last." : "Newest videos first."}</p>
          </div>
          <div className="rounded-xl border border-line p-3">
            <Toggle on={home.shuffleShorts} onChange={(v) => setHome((h) => ({ ...h, shuffleShorts: v }))} label="Shuffle Shorts" />
            <p className="mt-1.5 text-xs text-muted">{home.shuffleShorts ? "Each Shorts row shows a different random mix." : "Newest Shorts first."}</p>
          </div>
          <label className="block rounded-xl border border-line p-3">
            <span className="mb-1.5 block text-sm font-medium">Shorts row after every</span>
            <Select
              value={String(home.shortsEvery)}
              onChange={(v) => setHome((h) => ({ ...h, shortsEvery: Number(v) }))}
              options={[2, 3, 4, 5, 6, 8, 10, 12].map((n) => [String(n), `${n} videos`])}
              className="w-full"
            />
          </label>
        </div>
      </Card>

      <Block title="Pinned videos" hint="Shown first in the Home feed, in this order." onAdd={() => setPicker({ kind: "videos", target: "pinnedVideos" })}>
        <List items={home.pinnedVideos} onChange={(list) => setHome((h) => ({ ...h, pinnedVideos: list }))} render={videoRow} />
      </Block>

      <Block title="Pinned Shorts" hint="Lead the Shorts shelf on Home and the Shorts page." onAdd={() => setPicker({ kind: "shorts", target: "pinnedShorts" })}>
        <List items={home.pinnedShorts} onChange={(list) => setHome((h) => ({ ...h, pinnedShorts: list }))} render={videoRow} />
      </Block>

      <Block
        title="Featured rows"
        hint={'Your own rows between feed items — e.g. "Eid special" or "Top natok".'}
        onAdd={() => setHome((h) => ({ ...h, sections: [...h.sections, { id: `new-${Date.now()}`, title: "New row", enabled: true, videos: [] }] }))}
      >
        <div className="space-y-4">
          {home.sections.length === 0 && <p className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-muted">No rows yet.</p>}
          {home.sections.map((section, index) => (
            <div key={section.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <TextInput label="Row title" placeholder="e.g. Trending in Bangladesh" value={section.title} maxLength={80} onChange={(e) => setSection(index, { title: e.target.value })} />
                </div>
                <Toggle on={section.enabled} onChange={(v) => setSection(index, { enabled: v })} label="Visible" />
                <Btn onClick={() => setHome((h) => ({ ...h, sections: move(h.sections, index, -1) }))} disabled={index === 0} aria-label="Move row up">
                  <ArrowUp className="h-4 w-4" />
                </Btn>
                <Btn onClick={() => setPicker({ kind: "videos", target: "section", index })}>
                  <Plus className="h-4 w-4" /> Videos
                </Btn>
                <Btn tone="danger" onClick={() => setHome((h) => ({ ...h, sections: h.sections.filter((_, i) => i !== index) }))} aria-label="Delete row">
                  <Trash2 className="h-4 w-4" />
                </Btn>
              </div>
              <div className="mt-3">
                <List items={section.videos} onChange={(list) => setSection(index, { videos: list })} render={videoRow} />
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Channels to watch" hint="The channel row on Home. Leave empty to show the biggest channels automatically." onAdd={() => setPicker({ kind: "channels", target: "featuredChannels" })}>
        <List items={home.featuredChannels} onChange={(list) => setHome((h) => ({ ...h, featuredChannels: list }))} render={channelRow} />
      </Block>

      {picker && <Picker kind={picker.kind} chosen={pickerChosen()} onAdd={addPicked} onClose={() => setPicker(null)} />}
    </div>
  );
};

export default HomeCuration;
