import React, { useEffect, useMemo, useState } from "react";
import { Image, Layers, Pencil, Plus, Stamp, Trash2, Video } from "lucide-react";

import UploadProgressModal from "../components/UploadProgressModal";
import { Card, EmptyState, PageHeader, Spinner } from "../components/ui";
import { Badge, Btn, FilePicker, Modal, Select, TextInput, Toggle } from "../components/kit";
import { api, apiError, get, send } from "../api/client";
import { isUploadCancelled, useUploadProgress } from "../hooks/useUploadProgress";
import { IMAGE_ACCEPT } from "../utils/media";
import { fullDate } from "../utils/format";
import { toast, confirmDialog } from "../utils/alerts";

// Admin → Live TV overlays: what sits in a corner of the Live TV player.
//   Logo  — always on screen (replaces the PipraTube logo there).
//   Image / Video — a short ad that appears now and then.
// Each one can be for every channel, one channel or a few.

const KINDS = [
  ["logo", "Logo", Stamp],
  ["image", "Image ad", Image],
  ["video", "Video ad", Video],
];
const KIND_LABEL = { logo: "Logo", image: "Image ad", video: "Video ad" };
const POSITIONS = [
  ["top-right", "Top right"],
  ["top-left", "Top left"],
  ["bottom-right", "Bottom right"],
  ["bottom-left", "Bottom left"],
];
const SIZES = [
  ["small", "Small"],
  ["medium", "Medium"],
  ["large", "Large"],
];
const toInput = (date) => (date ? new Date(date).toISOString().slice(0, 10) : "");

const ChannelPicker = ({ channels, value, onChange }) => {
  const all = value.length === 0;
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="sm:col-span-2">
      <span className="mb-1.5 block text-sm text-muted">Channels</span>
      <div className="mb-2 flex gap-2">
        <button type="button" onClick={() => onChange([])} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold ${all ? "border-brand bg-brand/10" : "border-line"}`}>
          All channels
        </button>
        <button
          type="button"
          onClick={() => !value.length && channels[0] && onChange([String(channels[0].id)])}
          className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold ${!all ? "border-brand bg-brand/10" : "border-line"}`}
        >
          Choose channels
        </button>
      </div>
      {!all && (
        <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2">
          {channels.map((c) => {
            const id = String(c.id);
            return (
              <label key={id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                <input type="checkbox" checked={value.includes(id)} onChange={() => toggle(id)} className="h-4 w-4 accent-[#ff2d6f]" />
                {c.logo ? <img src={c.logo} alt="" className="h-6 w-6 rounded object-contain" /> : <span className="h-6 w-6 rounded bg-card-2" />}
                <span className="truncate text-sm">{c.name}</span>
              </label>
            );
          })}
        </div>
      )}
      {!all && <p className="mt-1 text-xs text-muted">{value.length} channel{value.length === 1 ? "" : "s"} chosen</p>}
    </div>
  );
};

// Create (overlay = null) or edit one overlay.
const OverlayForm = ({ overlay, channels, onClose, onSaved }) => {
  const editing = Boolean(overlay);
  const [kind, setKind] = useState(overlay?.kind || "logo");
  const [form, setForm] = useState({
    title: overlay?.title || "",
    url: overlay?.url || "",
    position: overlay?.position || "top-right",
    size: overlay?.size || "medium",
    firstDelaySeconds: overlay?.firstDelaySeconds ?? 20,
    durationSeconds: overlay?.durationSeconds ?? 10,
    intervalSeconds: overlay?.intervalSeconds ?? 300,
    startAt: toInput(overlay?.startAt),
    endAt: toInput(overlay?.endAt),
  });
  const [chosen, setChosen] = useState((overlay?.channels || []).map(String));
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : overlay?.media || null), [file, overlay]);
  const { upload, start, reportSent, complete, fail, cancel, reset } = useUploadProgress();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!editing && !file) return toast.error(kind === "video" ? "Choose the video" : kind === "logo" ? "Choose the logo" : "Choose the image");
    setBusy(true);
    const body = new FormData();
    body.append("kind", kind);
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    body.append("channels", JSON.stringify(chosen));
    if (file) body.append(kind === "video" ? "video" : "thumbnail", file);
    const isVideo = kind === "video" && file;
    try {
      let data;
      if (editing) {
        data = await send("patch", `/api/admin/site/live-tv-overlays/${overlay.id}`, body);
      } else {
        const signal = isVideo ? start({ fileName: file.name, fileSize: file.size, storedBytes: 0 }) : undefined;
        const query = isVideo ? `?videoBytes=${file.size}` : "";
        const response = await api.post(`/api/admin/site/live-tv-overlays${query}`, body, { signal, onUploadProgress: (e) => isVideo && e.total && reportSent(e.loaded, e.total) });
        data = response.data.data;
        if (isVideo) await complete();
        reset();
      }
      toast.success(editing ? "Saved" : "Overlay created");
      onSaved(data.overlay);
    } catch (error) {
      if (isUploadCancelled(error)) reset();
      else {
        if (isVideo) fail(apiError(error, "Upload failed"));
        toast.error(apiError(error, "Couldn't save"));
      }
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <Modal
      wide
      title={editing ? "Edit overlay" : "New Live TV overlay"}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save" : "Create"}
          </Btn>
        </>
      }
    >
      {!editing && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {KINDS.map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setFile(null);
              }}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold ${kind === k ? "border-brand bg-brand/10" : "border-line"}`}
            >
              <Icon className="h-5 w-5" /> {label}
            </button>
          ))}
        </div>
      )}
      <p className="mb-4 text-sm text-muted">
        {kind === "logo"
          ? "Shown all the time in the chosen corner of the Live TV player, instead of the PipraTube logo. A logo made for a channel beats one for all channels."
          : `A ${kind === "video" ? "short video (5–10 seconds is best, it plays without sound)" : "picture"} that appears in the chosen corner now and then, with a × to close it.`}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Name (for you)" placeholder={kind === "logo" ? "e.g. Pipra TV logo" : "e.g. Grameenphone Eid offer"} value={form.title} onChange={set("title")} maxLength={100} />
        <TextInput label="Link when clicked (optional)" value={form.url} onChange={set("url")} placeholder="https://… or /live-tv" />

        {kind === "video" ? (
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-sm text-muted">Video {editing && <span className="text-xs text-slate-400">· to change it, make a new overlay</span>}</span>
            {editing ? (
              preview && <video src={preview} muted controls className="aspect-video w-56 rounded-lg bg-black" />
            ) : (
              <FilePicker accept="video/*" file={file} onChange={setFile} placeholder="MP4 / WebM / MOV · 5–10 seconds" />
            )}
          </div>
        ) : (
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm text-muted">
              {kind === "logo" ? "Logo" : "Image"} <span className="text-xs text-slate-400">· any image format · a transparent PNG works best for logos</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/20 bg-[repeating-conic-gradient(#1f2430_0_25%,#151922_0_50%)] bg-[length:16px_16px]">
                {preview ? <img src={preview} alt="" className="max-h-full max-w-full object-contain" /> : <span className="px-2 text-center text-xs text-slate-500">No image chosen</span>}
              </span>
              <span className="cursor-pointer rounded-xl border border-line bg-card-2 px-4 py-2 text-sm font-semibold hover:bg-white/10">
                {preview ? "Change" : "Choose image"}
                <input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
              </span>
            </span>
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm text-muted">Corner</span>
          <Select value={form.position} onChange={(v) => setForm((f) => ({ ...f, position: v }))} options={POSITIONS} className="w-full" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-muted">Size</span>
          <Select value={form.size} onChange={(v) => setForm((f) => ({ ...f, size: v }))} options={SIZES} className="w-full" />
        </label>

        {kind !== "logo" && (
          <>
            <TextInput label="First shows after (seconds of watching)" type="number" min={0} value={form.firstDelaySeconds} onChange={set("firstDelaySeconds")} />
            <TextInput label="Stays on screen (seconds)" type="number" min={3} max={120} value={form.durationSeconds} onChange={set("durationSeconds")} />
            <TextInput label="Then again every (seconds)" type="number" min={30} value={form.intervalSeconds} onChange={set("intervalSeconds")} />
            <div />
          </>
        )}

        <ChannelPicker channels={channels} value={chosen} onChange={setChosen} />

        <TextInput label="Starts (optional)" type="date" value={form.startAt} onChange={set("startAt")} />
        <TextInput label="Ends (optional)" type="date" value={form.endAt} onChange={set("endAt")} />
      </div>
      <UploadProgressModal upload={upload} onClose={reset} onCancel={cancel} />
    </Modal>
  );
};

const LiveTvOverlays = () => {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // overlay, or "new"

  useEffect(() => {
    get("/api/admin/site/live-tv-overlays")
      .then(setData)
      .catch(() => setData({ overlays: [], channels: [] }));
  }, []);

  const channelName = (id) => data?.channels.find((c) => String(c.id) === String(id))?.name || "Removed channel";
  const replace = (overlay) => setData((d) => ({ ...d, overlays: d.overlays.some((o) => o.id === overlay.id) ? d.overlays.map((o) => (o.id === overlay.id ? overlay : o)) : [overlay, ...d.overlays] }));

  const patch = async (overlay, changes) => {
    try {
      const result = await send("patch", `/api/admin/site/live-tv-overlays/${overlay.id}`, changes);
      replace(result.overlay);
    } catch (error) {
      toast.error(apiError(error, "Couldn't update"));
    }
  };

  const remove = async (overlay) => {
    if (!(await confirmDialog(`Delete "${overlay.title}"?`))) return;
    try {
      await send("delete", `/api/admin/site/live-tv-overlays/${overlay.id}`);
      setData((d) => ({ ...d, overlays: d.overlays.filter((o) => o.id !== overlay.id) }));
      toast.success("Deleted");
    } catch (error) {
      toast.error(apiError(error, "Couldn't delete"));
    }
  };

  return (
    <div>
      <PageHeader title="Live TV overlays" subtitle="Logos and short image / video ads in a corner of the Live TV player">
        <Btn tone="primary" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New overlay
        </Btn>
      </PageHeader>
      {data === null ? (
        <Spinner />
      ) : data.overlays.length === 0 ? (
        <EmptyState icon={Layers} title="No overlays yet" text="Add your logo for every channel or a few, or a short image / video ad that pops up in a corner of the player." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.overlays.map((o) => (
            <Card key={o.id} className="flex gap-3 p-3">
              <div className="flex aspect-video w-28 shrink-0 items-center justify-center self-start overflow-hidden rounded-lg bg-black sm:w-36">
                {o.kind === "video" ? <video src={o.media} muted className="h-full w-full object-cover" /> : <img src={o.media} alt="" className="max-h-full max-w-full object-contain" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{o.title}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge tone={o.kind === "logo" ? "blue" : "purple"}>{KIND_LABEL[o.kind]}</Badge>
                  <Badge>{POSITIONS.find(([k]) => k === o.position)?.[1]}</Badge>
                  <Badge tone="green">{o.channels.length ? (o.channels.length === 1 ? channelName(o.channels[0]) : `${o.channels.length} channels`) : "All channels"}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {o.startAt || o.endAt ? `${o.startAt ? fullDate(o.startAt) : "now"} → ${o.endAt ? fullDate(o.endAt) : "no end"}` : "Always on"}
                  {o.kind !== "logo" && ` · ${o.durationSeconds}s on screen · every ${o.intervalSeconds < 120 ? `${o.intervalSeconds}s` : `${Math.round(o.intervalSeconds / 60)} min`}`}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Toggle on={o.enabled} onChange={(v) => patch(o, { enabled: v })} label={o.enabled ? "On" : "Off"} />
                  <Btn tone="plain" onClick={() => setEditing(o)} aria-label="Edit" className="ml-auto">
                    <Pencil className="h-4 w-4" />
                  </Btn>
                  <Btn tone="plain" onClick={() => remove(o)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <OverlayForm
          overlay={editing === "new" ? null : editing}
          channels={data?.channels || []}
          onClose={() => setEditing(null)}
          onSaved={(overlay) => {
            replace(overlay);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};

export default LiveTvOverlays;
