import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Check, UploadCloud, Zap } from "lucide-react";

import UploadProgressModal from "../components/UploadProgressModal";
import { Avatar, Card, PageHeader, Spinner } from "../components/ui";
import { Btn, SearchInput, Select, TextArea, TextInput, Toggle } from "../components/kit";
import { api, apiError, get } from "../api/client";
import { isUploadCancelled, useUploadProgress } from "../hooks/useUploadProgress";
import { compressImage, formatBytes, IMAGE_ACCEPT, inspectVideo } from "../utils/media";
import { isVideoFile, MAX_UPLOAD_GB, uploadVideoFile, VIDEO_ACCEPT } from "../utils/chunkedUpload";
import { thumbSpec, thumbWarning } from "../utils/thumbs";
import { VIDEO_CATEGORIES } from "../utils/format";
import { toast } from "../utils/alerts";


// Upload a video on behalf of any channel (e.g. the official PipraTube one).
const UploadVideo = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [channels, setChannels] = useState(null);
  const [channel, setChannel] = useState(null);
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState(null);
  const [frame, setFrame] = useState(0);
  const [form, setForm] = useState({ title: "", description: "", category: "Other", tags: "", visibility: "public", allowComments: true });
  const [busy, setBusy] = useState(false);
  const { upload, start, reportSent, complete, fail, cancel, reset } = useUploadProgress();
  const [customThumb, setCustomThumb] = useState(null);
  const [thumbNote, setThumbNote] = useState("");
  const chosenThumb = customThumb || meta?.candidates?.[frame] || null;
  const frameUrl = useMemo(() => (chosenThumb ? URL.createObjectURL(chosenThumb) : null), [chosenThumb]);

  useEffect(() => {
    const timer = setTimeout(() => {
      get("/api/admin/pick-channels", { search: search || undefined })
        .then((d) => setChannels(d.channels))
        .catch(() => setChannels([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const pick = async (picked) => {
    if (!isVideoFile(picked)) return toast.error("That isn't a video file");
    if (picked.size > MAX_UPLOAD_GB * 1024 ** 3) return toast.error(`Videos can be up to ${MAX_UPLOAD_GB} GB`);
    // Formats the browser can't read (AVI, WMV…) still upload — the server
    // finds the length and makes the thumbnail while converting.
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000));
    const info = await Promise.race([inspectVideo(picked), timeout]).catch(() => null);
    setFile(picked);
    setMeta(info?.durationSeconds ? info : { durationSeconds: 0, width: 0, height: 0, candidates: [], unreadable: true });
    setFrame(0);
    setForm((f) => ({ ...f, title: f.title || picked.name.replace(/\.[^.]+$/, "") }));
    return undefined;
  };

  const publish = async () => {
    if (!channel) return toast.error("Choose a channel");
    if (!file) return toast.error("Choose a video file");
    if (!form.title.trim()) return toast.error("Add a title");
    setBusy(true);
    const body = new FormData();
    body.append("channelId", channel.id);
    Object.entries({ ...form, tags: JSON.stringify(form.tags.split(",").map((t) => t.trim()).filter(Boolean)) }).forEach(([k, v]) => body.append(k, v));
    if (chosenThumb) body.append("thumbnail", chosenThumb);

    // The file goes straight to Bunny Stream (or in pieces through our server
    // when Stream isn't set up); it's published once processing finishes.
    try {
      const signal = start({ fileName: file.name, fileSize: file.size, storedBytes: 0 });
      const uploaded = await uploadVideoFile(file, { signal, onProgress: (sent, total) => reportSent(sent, total) });
      Object.entries(uploaded).forEach(([key, value]) => body.append(key, value));
      await api.post("/api/admin/videos", body, { signal });
      await complete();
      await new Promise((r) => setTimeout(r, 500));
      reset();
      toast.success("Uploaded — it goes live as soon as processing finishes");
      navigate("/videos");
    } catch (error) {
      if (isUploadCancelled(error)) {
        reset();
        toast.info("Upload cancelled");
      } else {
        fail(apiError(error, "Upload failed"));
        toast.error(apiError(error, "Upload failed"));
      }
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isShort = meta && meta.durationSeconds <= 120;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Upload video" subtitle="Publish a video on behalf of any channel" />

      <Card className="p-4">
        <p className="mb-3 font-semibold">1. Channel</p>
        {channel ? (
          <div className="flex items-center gap-3">
            <Avatar src={channel.avatar} name={channel.name} size="h-10 w-10" ring={false} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{channel.name}</p>
              <p className="text-xs text-muted">@{channel.handle}</p>
            </div>
            <Btn onClick={() => setChannel(null)}>Change</Btn>
          </div>
        ) : (
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search channels" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {channels === null ? (
                <Spinner className="py-4" />
              ) : channels.length === 0 ? (
                <p className="text-sm text-muted">No channels yet — a user has to create one on the site first.</p>
              ) : (
                channels.map((c) => (
                  <button key={c.id} type="button" onClick={() => setChannel(c)} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-2.5 text-left hover:bg-white/5">
                    <Avatar src={c.avatar} name={c.name} size="h-9 w-9" ring={false} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{c.name}</span>
                      <span className="block truncate text-xs text-muted">@{c.handle}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </Card>

      <Card className="p-4">
        <p className="mb-3 font-semibold">2. Video file</p>
        {file ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{file.name}</span>
            <span className="text-muted">
              {Math.round(meta.durationSeconds)}s · {meta.width}×{meta.height} · {formatBytes(file.size)}
            </span>
            {isShort && (
              <span className="flex items-center gap-1 rounded bg-live/15 px-2 py-0.5 text-xs font-bold text-[#ff6b81]">
                <Zap className="h-3.5 w-3.5" /> Short
              </span>
            )}
            <Btn onClick={() => setFile(null)}>Change</Btn>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-white/15 py-10 text-center hover:border-brand/50">
            <UploadCloud className="h-10 w-10 text-muted" />
            <span className="font-semibold">Choose a video</span>
            <span className="text-xs text-muted">MP4, MOV, MKV, WEBM, AVI, WMV, FLV, MPG, 3GP and more · up to {MAX_UPLOAD_GB} GB</span>
            <input type="file" accept={VIDEO_ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
          </label>
        )}
      </Card>

      {file && (
        <Card className="grid gap-4 p-4 sm:grid-cols-[1fr_260px]">
          <div className="space-y-3">
            <p className="font-semibold">3. Details</p>
            <TextInput label="Title" placeholder="Add a title that describes your video" value={form.title} onChange={set("title")} maxLength={120} />
            <TextArea label="Description" placeholder="Tell viewers about your video" rows={4} value={form.description} onChange={set("description")} />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm text-muted">Category</span>
                <Select value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} options={VIDEO_CATEGORIES.map((c) => [c, c])} className="w-full" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-muted">Visibility</span>
                <Select value={form.visibility} onChange={(v) => setForm((f) => ({ ...f, visibility: v }))} options={[["public", "Public"], ["unlisted", "Unlisted"], ["private", "Private"]]} className="w-full" />
              </label>
            </div>
            <TextInput label="Tags (comma separated)" placeholder="natok, drama, bangla" value={form.tags} onChange={set("tags")} />
            <Toggle on={form.allowComments} onChange={(v) => setForm((f) => ({ ...f, allowComments: v }))} label="Allow comments" />
          </div>
          <div>
            <p className="mb-1.5 text-sm text-muted">Thumbnail</p>
            <p className="mb-2 rounded-lg bg-card-2 px-2.5 py-1.5 text-xs text-slate-300">
              {thumbSpec(isShort).label}: <span className="font-semibold text-white">{thumbSpec(isShort).width} × {thumbSpec(isShort).height} px</span> ({thumbSpec(isShort).ratio})
            </p>
            <div className={`${thumbSpec(isShort).shape} mx-auto max-h-80 overflow-hidden rounded-xl bg-card-2`}>{frameUrl && <img src={frameUrl} alt="" className="h-full w-full object-cover" />}</div>
            {thumbNote && <p className="mt-1.5 text-xs text-amber-300">{thumbNote}</p>}
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {(meta.candidates || []).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setFrame(i);
                    setCustomThumb(null);
                    setThumbNote("");
                  }}
                  className={`relative h-8 cursor-pointer rounded-md text-xs font-semibold ${!customThumb && frame === i ? "bg-white text-black" : "bg-card-2"}`}
                >
                  {!customThumb && frame === i && <Check className="absolute left-1 top-1.5 h-3.5 w-3.5" />} Frame {i + 1}
                </button>
              ))}
            </div>
            <label className={`mt-1.5 flex h-9 cursor-pointer items-center justify-center rounded-md text-xs font-semibold ${customThumb ? "bg-white text-black" : "border border-dashed border-white/25 hover:bg-white/5"}`}>
              {customThumb ? "Custom image ✓ (change)" : "Upload your own image"}
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                className="hidden"
                onChange={async (e) => {
                  const picked = e.target.files?.[0];
                  e.target.value = "";
                  if (!picked) return;
                  const spec = thumbSpec(isShort);
                  setThumbNote(await thumbWarning(picked, spec));
                  setCustomThumb(await compressImage(picked, { maxWidth: spec.width, maxHeight: Math.max(spec.height, 1280) }));
                }}
              />
            </label>
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Btn onClick={() => navigate("/videos")}>Cancel</Btn>
        <Btn tone="primary" onClick={publish} disabled={busy || !file || !channel}>
          Publish
        </Btn>
      </div>

      <UploadProgressModal upload={upload} onClose={reset} onCancel={cancel} />
    </div>
  );
};

export default UploadVideo;
