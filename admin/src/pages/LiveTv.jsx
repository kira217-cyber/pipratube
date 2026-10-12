import React, { useEffect, useMemo, useState } from "react";
import { Download, Pencil, Plus, Radio, Trash2 } from "lucide-react";

import { EmptyState, PageHeader, Spinner } from "../components/ui";
import { Badge, Btn, Modal, SearchInput, Select, TextInput, Toggle } from "../components/kit";
import { api, apiError, get, send } from "../api/client";
import { compressImage, IMAGE_ACCEPT } from "../utils/media";
import { toast, confirmDialog } from "../utils/alerts";

const FLAGS = [
  ["enabled", "On site"],
  ["showOnList", "In its category row"],
  ["pinned", "Pinned (top)"],
  ["homeFeatured", "On Home"],
];

const ChannelForm = ({ channel, categories, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: channel?.name || "",
    streamUrl: channel?.streamUrl || "",
    categories: channel?.categories || [],
    enabled: channel ? channel.enabled : true,
    showOnList: channel?.showOnList || false,
    pinned: channel?.pinned || false,
    homeFeatured: channel?.homeFeatured || false,
  });
  const [logo, setLogo] = useState(null);
  const [source, setSource] = useState(null);
  const [sourceSearch, setSourceSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (logo ? URL.createObjectURL(logo) : channel?.logo), [logo, channel]);

  useEffect(() => {
    if (channel) return;
    get("/api/admin/site/live-tv/source")
      .then((d) => setSource(d.channels))
      .catch(() => setSource([]));
  }, [channel]);

  const toggleCategory = (key) =>
    setForm((f) => ({ ...f, categories: f.categories.includes(key) ? f.categories.filter((k) => k !== key) : [...f.categories, key] }));

  const save = async () => {
    if (!form.name.trim() || !form.streamUrl.trim()) return toast.error("Name and stream URL are required");
    setBusy(true);
    try {
      const body = new FormData();
      Object.entries({ ...form, categories: JSON.stringify(form.categories) }).forEach(([k, v]) => body.append(k, v));
      if (logo) body.append("logo", logo);
      const data = channel ? await send("patch", `/api/admin/site/live-tv/${channel.id}`, body) : await send("post", "/api/admin/site/live-tv", body);
      toast.success(channel ? "Channel saved" : "Channel added");
      onSaved(data.channel);
    } catch (error) {
      toast.error(apiError(error, "Couldn't save"));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const sourceShown = (source || []).filter((s) => !sourceSearch || s.name.toLowerCase().includes(sourceSearch.toLowerCase())).slice(0, 60);

  return (
    <Modal
      wide
      title={channel ? `Edit ${channel.name}` : "Add Live TV channel"}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Btn>
        </>
      }
    >
      {!channel && (
        <div className="mb-4 rounded-xl border border-line p-3">
          <p className="mb-2 text-sm font-semibold">Fill from the IPTV list</p>
          <SearchInput value={sourceSearch} onChange={setSourceSearch} placeholder="Search channel list" />
          <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {source === null ? (
              <Spinner className="py-2" />
            ) : (
              sourceShown.map((s) => (
                <button key={s.url} type="button" onClick={() => setForm((f) => ({ ...f, name: s.name, streamUrl: s.url }))} className="cursor-pointer rounded-full bg-card-2 px-3 py-1 text-xs hover:bg-white/15">
                  {s.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <div className="space-y-3">
          <TextInput label="Name" placeholder="e.g. Somoy TV" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <TextInput label="Stream URL (.m3u8)" placeholder="https://example.com/live/index.m3u8" value={form.streamUrl} onChange={(e) => setForm((f) => ({ ...f, streamUrl: e.target.value }))} />
        </div>
        <div>
          <p className="mb-1.5 text-sm text-muted">
            Logo <span className="text-xs text-slate-400">· 512 × 512 px, square</span>
          </p>
          <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-white p-2">
            {preview ? <img src={preview} alt="" className="max-h-full max-w-full object-contain" /> : <Radio className="h-8 w-8 text-black/40" />}
            <input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={async (e) => e.target.files?.[0] && setLogo(await compressImage(e.target.files[0], { maxWidth: 400, maxHeight: 400 }))} />
          </label>
        </div>
      </div>
      <p className="mb-2 mt-4 text-sm text-muted">Categories</p>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button key={c.key} type="button" onClick={() => toggleCategory(c.key)} className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold ${form.categories.includes(c.key) ? "bg-brand text-white" : "bg-card-2 text-slate-300"}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {FLAGS.map(([key, label]) => (
          <Toggle key={key} on={form[key]} onChange={(v) => setForm((f) => ({ ...f, [key]: v }))} label={label} />
        ))}
      </div>
    </Modal>
  );
};

const LiveTv = () => {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState(null); // channel | "new"
  const [job, setJob] = useState(null);

  const load = () =>
    get("/api/admin/site/live-tv")
      .then(setData)
      .catch(() => setData({ channels: [], categories: [] }));

  useEffect(() => {
    load();
  }, []);

  // Poll the import while it runs.
  useEffect(() => {
    if (!job?.running) return undefined;
    const timer = setInterval(async () => {
      const d = await get("/api/admin/site/live-tv/import").catch(() => null);
      if (!d) return;
      setJob(d.job);
      if (!d.job.running) {
        toast.success(`Import finished: ${d.job.added} added, ${d.job.skipped} already here`);
        load();
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [job]);

  if (!data) return <Spinner className="min-h-[50vh]" />;

  const patch = async (channel, changes) => {
    setData((d) => ({ ...d, channels: d.channels.map((c) => (c.id === channel.id ? { ...c, ...changes } : c)) }));
    try {
      await send("patch", `/api/admin/site/live-tv/${channel.id}`, changes);
    } catch (error) {
      toast.error(apiError(error, "Couldn't update"));
      load();
    }
  };

  const remove = async (channel) => {
    if (!(await confirmDialog(`Delete ${channel.name}?`))) return;
    await send("delete", `/api/admin/site/live-tv/${channel.id}`).catch(() => null);
    setData((d) => ({ ...d, channels: d.channels.filter((c) => c.id !== channel.id) }));
  };

  const startImport = async () => {
    if (!(await confirmDialog("Copy the Live TV channels from the current pipratv.com site? Channels already here are skipped; the old site is only read."))) return;
    const { data: res } = await api.post("/api/admin/site/live-tv/import", {});
    setJob(res.data.job);
  };

  const label = (key) => data.categories.find((c) => c.key === key)?.label || key;
  const shown = data.channels.filter(
    (c) => (!category || (category === "__none" ? !c.categories.length : c.categories.includes(category))) && (!search || c.name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div>
      <PageHeader title="Live TV" subtitle={`${data.channels.length} channels`}>
        <div className="flex gap-2">
          <Btn onClick={startImport} disabled={job?.running}>
            <Download className="h-4 w-4" /> {job?.running ? `Importing ${job.done}/${job.total || "…"}` : "Import from old site"}
          </Btn>
          <Btn tone="primary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add channel
          </Btn>
        </div>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search channels" />
        <Select value={category} onChange={setCategory} options={[["", "All categories"], ...data.categories.map((c) => [c.key, c.label]), ["__none", "No category"]]} />
      </div>

      <div className="mt-4">
        {shown.length === 0 ? (
          <EmptyState icon={Radio} title="No channels" text="Add a channel, or import the ones from the current site." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((c) => (
              <div key={c.id} className={`rounded-2xl border border-line bg-card p-3 ${c.enabled ? "" : "opacity-60"}`}>
                <div className="flex items-center gap-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
                    {c.logo ? <img src={c.logo} alt="" className="max-h-full max-w-full object-contain" /> : <Radio className="h-6 w-6 text-black/40" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="truncate text-xs text-muted">{c.streamUrl}</p>
                  </div>
                  <Btn tone="plain" onClick={() => setEditing(c)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Btn>
                  <Btn tone="plain" onClick={() => remove(c)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Btn>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.categories.length ? c.categories.map((k) => <Badge key={k}>{label(k)}</Badge>) : <Badge tone="amber">No category</Badge>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {FLAGS.map(([key, text]) => (
                    <Toggle key={key} on={c[key]} onChange={(v) => patch(c, { [key]: v })} label={text} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ChannelForm
          channel={editing === "new" ? null : editing}
          categories={data.categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
};

export default LiveTv;
