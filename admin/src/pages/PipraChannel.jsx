import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CalendarClock, Plus, Radio, Repeat, Save, Trash2, X } from "lucide-react";

import { Card, PageHeader, Spinner } from "../components/ui";
import { Badge, Btn, Modal, SearchInput, TextInput, Toggle } from "../components/kit";
import { api, apiError, get, send, SITE_URL } from "../api/client";
import { compressImage, IMAGE_ACCEPT } from "../utils/media";
import { toast } from "../utils/alerts";

const clock = (seconds) => {
  const s = Math.round(seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
};

const VideoPicker = ({ onPick, onClose, title = "Choose a video" }) => {
  const [search, setSearch] = useState("");
  const [videos, setVideos] = useState(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      get("/api/admin/site/pipra-channel/pick", { search: search || undefined })
        .then((d) => setVideos(d.videos))
        .catch(() => setVideos([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  return (
    <Modal wide title={title} onClose={onClose} footer={<Btn onClick={onClose}>Done</Btn>}>
      <SearchInput value={search} onChange={setSearch} placeholder="Search the video library" />
      <div className="mt-3 space-y-2">
        {videos === null ? (
          <Spinner className="py-6" />
        ) : videos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No videos found.</p>
        ) : (
          videos.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-xl border border-line p-2">
              <div className="w-24 shrink-0 overflow-hidden rounded-md bg-card-2">{v.thumbnail && <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{v.title}</p>
                <p className="truncate text-xs text-muted">
                  {v.channel?.name} · {clock(v.durationSeconds)}
                </p>
              </div>
              <Btn onClick={() => onPick(v)}>Add</Btn>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
};

// Pipra TV's own Live TV channel: a looping lineup plus scheduled slots,
// played on a shared clock so every viewer sees the same moment.
const PipraChannel = () => {
  const [ch, setCh] = useState(null);
  const [categories, setCategories] = useState([]);
  const [picker, setPicker] = useState(null); // "loop" | "slot"
  const [slot, setSlot] = useState({ startTime: "20:00", date: "", video: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get("/api/admin/site/pipra-channel")
      .then((d) => setCh(d.channel))
      .catch(() => setCh(false));
    get("/api/admin/site/live-tv")
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, []);

  if (ch === null) return <Spinner className="min-h-[50vh]" />;
  if (ch === false) return <p className="text-muted">Couldn't load the channel.</p>;

  const move = (index, delta) => {
    const loop = [...ch.loop];
    const target = index + delta;
    if (target < 0 || target >= loop.length) return;
    [loop[index], loop[target]] = [loop[target], loop[index]];
    setCh({ ...ch, loop });
  };

  const save = async () => {
    setBusy(true);
    try {
      const data = await send("put", "/api/admin/site/pipra-channel", {
        name: ch.name,
        enabled: ch.enabled,
        homeFeatured: ch.homeFeatured,
        pinned: ch.pinned,
        categories: ch.categories,
        loop: ch.loop.map((v) => v.id),
        schedule: ch.schedule.map((s) => ({ video: s.video.id, startTime: s.startTime, date: s.date || null })),
      });
      setCh(data.channel);
      toast.success("Pipra TV channel saved");
    } catch (error) {
      toast.error(apiError(error, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async (file) => {
    const body = new FormData();
    body.append("logo", await compressImage(file, { maxWidth: 512, maxHeight: 512 }));
    try {
      const { data } = await api.patch("/api/admin/site/pipra-channel/logo", body);
      setCh((c) => ({ ...c, logo: data.data.channel.logo }));
      toast.success("Logo saved");
    } catch (error) {
      toast.error(apiError(error, "Couldn't upload"));
    }
  };

  const loopTotal = ch.loop.reduce((sum, v) => sum + (v.durationSeconds || 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Pipra TV channel" subtitle="Our own Live TV channel — plays your videos on a schedule, like real TV">
        <div className="flex gap-2">
          <a href={`${SITE_URL}/live-tv/${ch.id}`} target="_blank" rel="noreferrer" className="rounded-xl border border-line bg-card-2 px-3.5 py-2 text-sm font-semibold hover:bg-white/10">
            Watch
          </a>
          <Btn tone="primary" onClick={save} disabled={busy}>
            <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save"}
          </Btn>
        </div>
      </PageHeader>

      <Card className="flex flex-wrap items-center gap-4 p-4">
        <div className="shrink-0 text-center">
          <label className="flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-black" title="Change logo">
            {ch.logo ? <img src={ch.logo} alt="" className="h-full w-full object-cover" /> : <Radio className="h-8 w-8 text-brand" />}
            <input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          </label>
          <p className="mt-1 text-[11px] leading-tight text-slate-400">
            Logo
            <br />
            512 × 512 px
          </p>
        </div>
        <div className="min-w-[220px] flex-1">
          <TextInput label="Channel name" placeholder="Pipra TV" value={ch.name} onChange={(e) => setCh({ ...ch, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-2">
          <Toggle on={ch.enabled} onChange={(v) => setCh({ ...ch, enabled: v })} label="On air" />
          <Toggle on={ch.homeFeatured} onChange={(v) => setCh({ ...ch, homeFeatured: v })} label="Show on Home" />
          <Toggle on={ch.pinned} onChange={(v) => setCh({ ...ch, pinned: v })} label="Pinned on Live TV" />
        </div>
        <div className="w-full">
          <p className="mb-1.5 text-sm text-muted">Live TV categories</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCh({ ...ch, categories: ch.categories.includes(c.key) ? ch.categories.filter((k) => k !== c.key) : [...ch.categories, c.key] })}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold ${ch.categories.includes(c.key) ? "bg-brand text-white" : "bg-card-2 text-slate-300"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="flex items-center gap-3 border-live/30 bg-live/5 p-4">
        <span className="flex items-center gap-1.5 rounded-md bg-live px-2 py-0.5 text-xs font-bold">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> ON AIR
        </span>
        {ch.nowPlaying ? (
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">{ch.nowPlaying.video.title}</span>
            <span className="text-muted"> · at {clock(ch.nowPlaying.offsetSeconds)} · {ch.nowPlaying.isFallback ? "from the loop" : "scheduled slot"}</span>
          </p>
        ) : (
          <p className="text-sm text-muted">Nothing to play — add videos to the loop below.</p>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 font-semibold">
              <Repeat className="h-5 w-5 text-brand" /> Loop
            </p>
            <p className="text-sm text-muted">
              Plays back-to-back, around the clock, whenever no slot is scheduled · {ch.loop.length} videos · {clock(loopTotal)} per cycle
            </p>
          </div>
          <Btn onClick={() => setPicker("loop")}>
            <Plus className="h-4 w-4" /> Add videos
          </Btn>
        </div>
        {ch.loop.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-muted">The loop is empty.</p>
        ) : (
          <ol className="space-y-2">
            {ch.loop.map((v, i) => (
              <li key={`${v.id}-${i}`} className="flex items-center gap-3 rounded-xl border border-line p-2">
                <span className="w-5 text-center text-xs text-muted">{i + 1}</span>
                <div className="w-20 shrink-0 overflow-hidden rounded-md bg-card-2">{v.thumbnail && <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />}</div>
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{v.title}</p>
                <span className="hidden text-xs text-muted sm:block">{clock(v.durationSeconds)}</span>
                <Btn tone="plain" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  <ArrowUp className="h-4 w-4" />
                </Btn>
                <Btn tone="plain" onClick={() => move(i, 1)} disabled={i === ch.loop.length - 1} aria-label="Move down">
                  <ArrowDown className="h-4 w-4" />
                </Btn>
                <Btn tone="plain" onClick={() => setCh({ ...ch, loop: ch.loop.filter((_, j) => j !== i) })} aria-label="Remove">
                  <X className="h-4 w-4" />
                </Btn>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="p-4">
        <p className="flex items-center gap-2 font-semibold">
          <CalendarClock className="h-5 w-5 text-brand" /> Schedule
        </p>
        <p className="text-sm text-muted">A slot interrupts the loop at its time. Leave the date empty to repeat every day; a dated slot wins over a daily one.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
          <div className="w-32">
            <TextInput label="Time" type="time" value={slot.startTime} onChange={(e) => setSlot({ ...slot, startTime: e.target.value })} />
          </div>
          <div className="w-44">
            <TextInput label="Date (optional)" type="date" value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} />
          </div>
          <Btn onClick={() => setPicker("slot")}>{slot.video ? slot.video.title.slice(0, 28) : "Choose video"}</Btn>
          <Btn
            tone="primary"
            disabled={!slot.video || !slot.startTime}
            onClick={() => {
              setCh({ ...ch, schedule: [...ch.schedule, { id: `new-${Date.now()}`, startTime: slot.startTime, date: slot.date || null, video: slot.video }] });
              setSlot({ ...slot, video: null });
            }}
          >
            <Plus className="h-4 w-4" /> Add slot
          </Btn>
        </div>
        <div className="mt-3 space-y-2">
          {ch.schedule.length === 0 && <p className="py-4 text-center text-sm text-muted">No slots — the loop plays all day.</p>}
          {[...ch.schedule]
            .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.startTime.localeCompare(b.startTime))
            .map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line p-2 text-sm">
                <Badge tone={s.date ? "purple" : "blue"}>{s.date || "Every day"}</Badge>
                <span className="font-mono font-semibold">{s.startTime}</span>
                <span className="min-w-0 flex-1 truncate">{s.video.title}</span>
                <span className="hidden text-xs text-muted sm:block">{clock(s.video.durationSeconds)}</span>
                <Btn tone="plain" onClick={() => setCh({ ...ch, schedule: ch.schedule.filter((x) => x.id !== s.id) })} aria-label="Remove slot">
                  <Trash2 className="h-4 w-4" />
                </Btn>
              </div>
            ))}
        </div>
        <p className="mt-2 text-xs text-muted">Times use the server's clock ({new Date(ch.serverTime).toLocaleTimeString()} when this page loaded). Remember to Save.</p>
      </Card>

      {picker && (
        <VideoPicker
          title={picker === "loop" ? "Add videos to the loop" : "Video for this slot"}
          onClose={() => setPicker(null)}
          onPick={(v) => {
            if (picker === "loop") {
              setCh((c) => ({ ...c, loop: [...c.loop, v] }));
              toast.success("Added to the loop");
            } else {
              setSlot((s) => ({ ...s, video: v }));
              setPicker(null);
            }
          }}
        />
      )}
    </div>
  );
};

export default PipraChannel;
