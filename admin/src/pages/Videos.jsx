import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ExternalLink, EyeOff, Pencil, RotateCcw, Trash2, Upload } from "lucide-react";

import { EmptyState, PageHeader, Spinner } from "../components/ui";
import { Badge, Btn, Modal, Pager, SearchInput, Select, TextArea, TextInput, Toggle } from "../components/kit";
import { apiError, get, send, SITE_URL } from "../api/client";
import { usePaged } from "../hooks/usePaged";
import { compressImage, IMAGE_ACCEPT } from "../utils/media";
import { thumbSpec, thumbWarning } from "../utils/thumbs";
import { formatCount, fullDate, VIDEO_CATEGORIES } from "../utils/format";
import { toast, confirmDialog } from "../utils/alerts";

const visTone = { public: "green", unlisted: "blue", private: "gray" };

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
const toLocalInput = (date) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// Which channel the video belongs to — search any channel to move it there.
const ChannelField = ({ channel, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      get("/api/admin/pick-channels", { search: search || undefined })
        .then((d) => setItems(d.channels))
        .catch(() => setItems([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [open, search]);

  return (
    <div>
      <span className="mb-1.5 block text-sm text-muted">Channel</span>
      <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/20 p-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-sm">
          {channel?.name} <span className="text-muted">@{channel?.handle}</span>
        </span>
        <Btn onClick={() => setOpen((v) => !v)}>{open ? "Close" : "Change"}</Btn>
      </div>
      {open && (
        <div className="mt-2 rounded-xl border border-line p-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search channel name or @handle" />
          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
            {items.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/10 ${c.id === channel?.id ? "bg-brand/15" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-xs text-muted">@{c.handle}</span>
              </button>
            ))}
            {items.length === 0 && <p className="py-3 text-center text-xs text-muted">No channels found.</p>}
          </div>
        </div>
      )}
    </div>
  );
};

const EditVideo = ({ video, onClose, onSaved }) => {
  const [form, setForm] = useState({
    title: video.title,
    description: video.description || "",
    category: video.category,
    tags: (video.tags || []).join(", "),
    visibility: video.visibility,
    allowComments: video.allowComments,
    madeForKids: Boolean(video.madeForKids),
    publishAt: video.publishedAt ? toLocalInput(video.publishedAt) : "",
  });
  const [channel, setChannel] = useState(video.channel);
  const [thumb, setThumb] = useState(null);
  const [thumbNote, setThumbNote] = useState("");
  const spec = thumbSpec(video.isShort);
  const preview = useMemo(() => (thumb ? URL.createObjectURL(thumb) : video.thumbnail), [thumb, video.thumbnail]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      const body = new FormData();
      const { publishAt, ...fields } = form;
      Object.entries({ ...fields, tags: JSON.stringify(form.tags.split(",").map((t) => t.trim()).filter(Boolean)) }).forEach(([k, v]) => body.append(k, v));
      // Only send the date when it was changed, so a plain save keeps it.
      if (publishAt && publishAt !== toLocalInput(video.publishedAt)) body.append("publishAt", new Date(publishAt).toISOString());
      if (channel?.id && channel.id !== video.channel?.id) body.append("channelId", channel.id);
      if (thumb) body.append("thumbnail", thumb);
      const data = await send("patch", `/api/admin/videos/${video.id}`, body);
      toast.success("Video saved");
      onSaved(data.video);
    } catch (error) {
      toast.error(apiError(error, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title="Edit video"
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
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <div className="space-y-3">
          <TextInput label="Title" placeholder="Video title" value={form.title} onChange={set("title")} maxLength={120} />
          <TextArea label="Description" placeholder="Tell viewers about your video" rows={5} value={form.description} onChange={set("description")} />
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
          <ChannelField channel={channel} onChange={setChannel} />
          <TextInput
            label="Published (a future time schedules it)"
            type="datetime-local"
            value={form.publishAt}
            onChange={set("publishAt")}
            hint={new Date(form.publishAt) > new Date() ? "Scheduled — hidden from viewers until then." : undefined}
          />
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Toggle on={form.allowComments} onChange={(v) => setForm((f) => ({ ...f, allowComments: v }))} label="Allow comments" />
            <Toggle on={form.madeForKids} onChange={(v) => setForm((f) => ({ ...f, madeForKids: v }))} label="Made for kids" />
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm text-muted">Thumbnail</p>
          <p className="mb-2 rounded-lg bg-card-2 px-2.5 py-1.5 text-xs text-slate-300">
            {spec.label}: <span className="font-semibold text-white">{spec.width} × {spec.height} px</span> ({spec.ratio})
          </p>
          <div className={`${spec.shape} mx-auto max-h-72 overflow-hidden rounded-xl bg-card-2`}>{preview && <img src={preview} alt="" className="h-full w-full object-cover" />}</div>
          {thumbNote && <p className="mt-1.5 text-xs text-amber-300">{thumbNote}</p>}
          <label className="mt-2 block cursor-pointer rounded-xl border border-line bg-card-2 py-2 text-center text-sm font-semibold hover:bg-white/10">
            Change thumbnail
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={async (e) => {
                const picked = e.target.files?.[0];
                e.target.value = "";
                if (!picked) return;
                setThumbNote(await thumbWarning(picked, spec));
                setThumb(await compressImage(picked, { maxWidth: spec.width, maxHeight: Math.max(spec.height, 1280) }));
              }}
            />
          </label>
        </div>
      </div>
    </Modal>
  );
};

const RemoveVideo = ({ video, onClose, onSaved }) => {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      const data = await send("patch", `/api/admin/videos/${video.id}`, { status: "removed", removedReason: reason || "Removed by PipraTube" });
      toast.success("Video taken down");
      onSaved(data.video);
    } catch (error) {
      toast.error(apiError(error, "Couldn't remove"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Take this video down?"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="danger" onClick={remove} disabled={busy}>
            Take down
          </Btn>
        </>
      }
    >
      <p className="text-sm text-muted">It disappears from the site but stays in the creator's content list with your reason. You can restore it later.</p>
      <div className="mt-3">
        <TextInput label="Reason shown to the creator" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Copyright claim" />
      </div>
    </Modal>
  );
};

const Videos = () => {
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [visibility, setVisibility] = useState("");
  const [sort, setSort] = useState("newest");
  const list = usePaged("/api/admin/videos", { status: status || undefined, type: type || undefined, visibility: visibility || undefined, sort });
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const restore = async (video) => {
    try {
      const data = await send("patch", `/api/admin/videos/${video.id}`, { status: "published" });
      list.update(video.id, data.video);
      toast.success("Video restored");
    } catch (error) {
      toast.error(apiError(error, "Couldn't restore"));
    }
  };

  const destroy = async (video) => {
    if (!(await confirmDialog(`Delete "${video.title}" forever? Its file, likes and comments are removed too.`))) return;
    try {
      await send("delete", `/api/admin/videos/${video.id}`);
      toast.success("Video deleted");
      list.reload();
    } catch (error) {
      toast.error(apiError(error, "Couldn't delete"));
    }
  };

  return (
    <div>
      <PageHeader title="Videos" subtitle={`${list.total} total`}>
        <Link to="/videos/upload" className="bg-brand-gradient flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold">
          <Upload className="h-4 w-4" /> Upload video
        </Link>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search title or tag" />
        <Select value={status} onChange={setStatus} options={[["", "Any status"], ["published", "Published"], ["removed", "Removed"]]} />
        <Select value={type} onChange={setType} options={[["", "Videos & Shorts"], ["videos", "Videos"], ["shorts", "Shorts"]]} />
        <Select value={visibility} onChange={setVisibility} options={[["", "Any visibility"], ["public", "Public"], ["unlisted", "Unlisted"], ["private", "Private"]]} />
        <Select value={sort} onChange={setSort} options={[["newest", "Newest"], ["oldest", "Oldest"], ["views", "Most viewed"], ["likes", "Most liked"]]} />
      </div>

      <div className="mt-4">
        {list.loading ? (
          <Spinner />
        ) : list.items.length === 0 ? (
          <EmptyState title="No videos found" />
        ) : (
          <div className="divide-y divide-line rounded-2xl border border-line bg-card">
            {list.items.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                <div className="relative w-32 shrink-0 overflow-hidden rounded-lg bg-card-2 sm:w-40">
                  {v.thumbnail && <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />}
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px] font-semibold">{v.duration}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold">{v.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {v.channel?.name} · {fullDate(v.createdAt)} · {formatCount(v.views)} views · {formatCount(v.likes)} likes · {formatCount(v.commentCount)} comments
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {v.status === "processing" ? (
                      <Badge tone="blue">Processing {v.processing?.percent || 0}%</Badge>
                    ) : v.status === "failed" ? (
                      <Badge tone="red">Failed: {v.processing?.error || "couldn't process"}</Badge>
                    ) : v.status === "removed" ? (
                      <Badge tone="red">Removed{v.removedReason ? `: ${v.removedReason}` : ""}</Badge>
                    ) : (
                      <Badge tone={visTone[v.visibility]}>{v.visibility}</Badge>
                    )}
                    {v.isShort && <Badge tone="purple">Short</Badge>}
                    <Badge>{v.category}</Badge>
                  </div>
                </div>
                <div className="flex w-full shrink-0 gap-1.5 sm:w-auto">
                  <a href={`${SITE_URL}/watch/${v.id}`} target="_blank" rel="noreferrer" title="Open on site" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line hover:bg-white/10">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <Btn onClick={() => setEditing(v)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Btn>
                  {v.status === "removed" ? (
                    <Btn onClick={() => restore(v)} title="Restore">
                      <RotateCcw className="h-4 w-4" /> Restore
                    </Btn>
                  ) : (
                    <Btn onClick={() => setRemoving(v)} title="Take down">
                      <EyeOff className="h-4 w-4" /> Take down
                    </Btn>
                  )}
                  <Btn tone="danger" onClick={() => destroy(v)} title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}
        <Pager page={list.page} totalPages={list.totalPages} onPage={list.setPage} />
      </div>

      {editing && (
        <EditVideo
          video={editing}
          onClose={() => setEditing(null)}
          onSaved={(video) => {
            list.update(video.id, video);
            setEditing(null);
          }}
        />
      )}
      {removing && (
        <RemoveVideo
          video={removing}
          onClose={() => setRemoving(null)}
          onSaved={(video) => {
            list.update(video.id, video);
            setRemoving(null);
          }}
        />
      )}
    </div>
  );
};

export default Videos;
