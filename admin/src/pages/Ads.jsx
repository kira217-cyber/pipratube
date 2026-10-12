import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, Image, Megaphone, Plus, Trash2, Video } from "lucide-react";

import UploadProgressModal from "../components/UploadProgressModal";
import { Card, EmptyState, PageHeader, Spinner } from "../components/ui";
import { Badge, Btn, FilePicker, Modal, Select, TextInput, Toggle } from "../components/kit";
import { api, apiError, get, send, SITE_URL } from "../api/client";
import { isUploadCancelled, useUploadProgress } from "../hooks/useUploadProgress";
import { compressImage, IMAGE_ACCEPT } from "../utils/media";
import { fullDate } from "../utils/format";
import { toast, confirmDialog } from "../utils/alerts";

const PLACEMENT = { home_top: "Home — top card", home_feed: "Home — inside the feed" };
const toInput = (date) => (date ? new Date(date).toISOString().slice(0, 10) : "");

const NewAd = ({ onClose, onCreated }) => {
  const [kind, setKind] = useState("banner");
  const [form, setForm] = useState({ title: "", placement: "home_top", url: "", skipAfterSeconds: 5, firstDelaySeconds: 0, intervalSeconds: 600, onVideos: true, onLiveTv: false, startAt: "", endAt: "" });
  const [image, setImage] = useState(null);
  const [video, setVideo] = useState(null);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  const { upload, start, reportSent, complete, fail, cancel, reset } = useUploadProgress();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = async () => {
    if (!form.title.trim()) return toast.error("Give the ad a name");
    if (kind === "banner" && !image) return toast.error("Choose the banner image");
    if (kind === "video" && !video) return toast.error("Choose the ad video");
    setBusy(true);
    const body = new FormData();
    body.append("kind", kind);
    Object.entries(form).forEach(([k, v]) => body.append(k, v));
    if (image) body.append("thumbnail", image);
    if (video) body.append("video", video);
    try {
      const signal = video ? start({ fileName: video.name, fileSize: video.size, storedBytes: 0 }) : undefined;
      const query = video ? `?videoBytes=${video.size}` : "";
      const { data } = await api.post(`/api/admin/site/ads${query}`, body, { signal, onUploadProgress: (e) => video && e.total && reportSent(e.loaded, e.total) });
      if (video) await complete();
      reset();
      toast.success("Ad created");
      onCreated(data.data.ad);
    } catch (error) {
      if (isUploadCancelled(error)) reset();
      else {
        if (video) fail(apiError(error, "Upload failed"));
        toast.error(apiError(error, "Couldn't create the ad"));
      }
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <Modal
      wide
      title="New ad"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="primary" onClick={create} disabled={busy}>
            {busy ? "Creating…" : "Create ad"}
          </Btn>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2">
        {[
          ["banner", "Banner on Home", Image],
          ["video", "Video in the player", Video],
        ].map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold ${kind === k ? "border-brand bg-brand/10" : "border-line"}`}>
            <Icon className="h-5 w-5" /> {label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Name (shown to viewers on banners)" placeholder="e.g. Eid offer — 50% off" value={form.title} onChange={set("title")} maxLength={100} />
        <TextInput label="Link when clicked" value={form.url} onChange={set("url")} placeholder="https://… or /live-tv" />
        {kind === "banner" ? (
          <>
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Where</span>
              <Select value={form.placement} onChange={(v) => setForm((f) => ({ ...f, placement: v }))} options={Object.entries(PLACEMENT)} className="w-full" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm text-muted">Banner image <span className="text-xs text-slate-400">· 1280 × 720 px (16:9), any image format</span></span>
              <span className="flex items-center gap-3">
                <span className="flex aspect-video w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/20 bg-card-2 sm:w-48">
                  {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <span className="px-2 text-center text-xs text-slate-500">No image chosen · 1280×720</span>}
                </span>
                <span className="cursor-pointer rounded-xl border border-line bg-card-2 px-4 py-2 text-sm font-semibold hover:bg-white/10">
                  Choose image
                  <input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={async (e) => e.target.files?.[0] && setImage(await compressImage(e.target.files[0], { maxWidth: 1600, maxHeight: 1600 }))} />
                </span>
              </span>
            </label>
          </>
        ) : (
          <>
            <div className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm text-muted">Ad video</span>
              <FilePicker accept="video/*" file={video} onChange={setVideo} placeholder="MP4/WebM · 1280 × 720 (16:9) · under 30 seconds" />
            </div>
            <TextInput label="Viewers can skip after (seconds)" placeholder="5" type="number" min={0} max={60} value={form.skipAfterSeconds} onChange={set("skipAfterSeconds")} />
            <TextInput label="First shows after (seconds of watching)" placeholder="30" type="number" min={0} value={form.firstDelaySeconds} onChange={set("firstDelaySeconds")} />
            <TextInput label="Then every (seconds)" placeholder="600" type="number" min={30} value={form.intervalSeconds} onChange={set("intervalSeconds")} />
            <div className="flex flex-col justify-end gap-2">
              <Toggle on={form.onVideos} onChange={(v) => setForm((f) => ({ ...f, onVideos: v }))} label="Play on videos" />
              <Toggle on={form.onLiveTv} onChange={(v) => setForm((f) => ({ ...f, onLiveTv: v }))} label="Play on Live TV" />
            </div>
          </>
        )}
        <TextInput label="Starts (optional)" type="date" value={form.startAt} onChange={set("startAt")} />
        <TextInput label="Ends (optional)" type="date" value={form.endAt} onChange={set("endAt")} />
      </div>
      <UploadProgressModal upload={upload} onClose={reset} onCancel={cancel} />
    </Modal>
  );
};

const Ads = () => {
  const [ads, setAds] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    get("/api/admin/site/ads")
      .then((d) => setAds(d.ads))
      .catch(() => setAds([]));
  }, []);

  const patch = async (ad, changes) => {
    try {
      const data = await send("patch", `/api/admin/site/ads/${ad.id}`, changes);
      setAds((list) => list.map((a) => (a.id === ad.id ? data.ad : a)));
    } catch (error) {
      toast.error(apiError(error, "Couldn't update"));
    }
  };

  const remove = async (ad) => {
    if (!(await confirmDialog(`Delete the ad "${ad.title}"?`))) return;
    try {
      await send("delete", `/api/admin/site/ads/${ad.id}`);
      setAds((list) => list.filter((a) => a.id !== ad.id));
      toast.success("Ad deleted");
    } catch (error) {
      toast.error(apiError(error, "Couldn't delete"));
    }
  };

  return (
    <div>
      <PageHeader title="Ads" subtitle="Home banners and in-player video ads">
        <Btn tone="primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New ad
        </Btn>
      </PageHeader>
      {ads === null ? (
        <Spinner />
      ) : ads.length === 0 ? (
        <EmptyState icon={Megaphone} title="No ads yet" text="Create a banner for Home or a short video ad that plays inside the player." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {ads.map((ad) => (
            <Card key={ad.id} className="flex gap-3 p-3">
              <div className="aspect-video w-24 shrink-0 self-start overflow-hidden rounded-lg bg-black sm:w-36">
                {ad.kind === "banner" ? <img src={ad.image} alt="" className="h-full w-full object-cover" /> : <video src={ad.video} muted className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{ad.title}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge tone={ad.kind === "banner" ? "blue" : "purple"}>{ad.kind === "banner" ? PLACEMENT[ad.placement] : "Video ad"}</Badge>
                  {ad.kind === "video" && <Badge>{[ad.onVideos && "Videos", ad.onLiveTv && "Live TV"].filter(Boolean).join(" + ") || "Nowhere"}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {ad.startAt || ad.endAt ? `${toInput(ad.startAt) ? fullDate(ad.startAt) : "now"} → ${ad.endAt ? fullDate(ad.endAt) : "no end"}` : "Always on"}
                  {ad.kind === "video" && ` · skip after ${ad.skipAfterSeconds}s · every ${Math.round(ad.intervalSeconds / 60)} min`}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Toggle on={ad.enabled} onChange={(v) => patch(ad, { enabled: v })} label={ad.enabled ? "Running" : "Paused"} />
                  {ad.url && (
                    <a href={ad.url.startsWith("/") ? `${SITE_URL}${ad.url}` : ad.url} target="_blank" rel="noreferrer" className="ml-auto text-muted hover:text-white" title={ad.url}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <Btn tone="plain" onClick={() => remove(ad)} aria-label="Delete ad" className={ad.url ? "" : "ml-auto"}>
                    <Trash2 className="h-4 w-4" />
                  </Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {creating && (
        <NewAd
          onClose={() => setCreating(false)}
          onCreated={(ad) => {
            setAds((list) => [ad, ...(list || [])]);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
};

export default Ads;
