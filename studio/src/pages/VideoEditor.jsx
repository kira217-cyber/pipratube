import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CalendarClock, Check, Globe, ImagePlus, Link2, Lock, UploadCloud, Zap } from "lucide-react";

import UploadFlow from "../components/UploadFlow/UploadFlow";
import { Card, EmptyState, GhostButton, PrimaryButton, Spinner } from "../components/ui/ui";
import { apiError, studioApi } from "../api/studioApi";
import { useFetch } from "../hooks/useFetch";
import { isUploadCancelled, useUploadProgress } from "../hooks/useUploadProgress";
import { compressImage, formatBytes, IMAGE_ACCEPT, inspectVideo } from "../utils/media";
import { isVideoFile, MAX_UPLOAD_GB, uploadVideoFile, VIDEO_ACCEPT } from "../utils/chunkedUpload";
import { viewsText } from "../utils/format";
import { VIDEO_CATEGORIES } from "../utils/categories";
import { playableSrc, useHlsSource } from "../utils/hls";
import { toast } from "../utils/alerts";

const SHORT_MAX_SECONDS = 120;
const MAX_TITLE = 100;
const MAX_DESCRIPTION = 5000;

const clock = (seconds) => {
  const s = Math.round(seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
const toLocalInput = (date) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const VISIBILITY = [
  { key: "public", label: "Public", hint: "Everyone can watch your video", icon: Globe },
  { key: "unlisted", label: "Unlisted", hint: "Anyone with the video link can watch", icon: Link2 },
  { key: "private", label: "Private", hint: "Only you can watch", icon: Lock },
  { key: "schedule", label: "Schedule", hint: "Goes public at the date and time you choose", icon: CalendarClock },
];

const useObjectUrl = (file) => {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
};

const Counter = ({ value, max }) => (
  <span className={`text-xs ${value > max * 0.9 ? "text-amber-300" : "text-muted"}`}>
    {value}/{max}
  </span>
);

// Recommended thumbnail sizes: Shorts are vertical, other videos 16:9.
const THUMB_SPEC = {
  short: { width: 1080, height: 1920, ratio: "9:16", tile: "aspect-[9/16]" },
  video: { width: 1280, height: 720, ratio: "16:9", tile: "aspect-video" },
};

const imageSize = (file) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });

const FrameTile = ({ file, url, selected, onSelect, tile = "aspect-video" }) => {
  const objectUrl = useObjectUrl(file);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative ${tile} overflow-hidden rounded-lg border-2 bg-black transition ${
        selected ? "border-white" : "border-transparent opacity-80 hover:opacity-100"
      }`}
    >
      <img src={objectUrl || url} alt="" className="h-full w-full object-cover" />
      {selected && (
        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-black">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      )}
    </button>
  );
};

// Drop zone before a file is chosen.
const PickFile = ({ onPick }) => {
  const [over, setOver] = useState(false);
  const input = useRef(null);
  return (
    <Card
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onPick(file);
      }}
      className={`flex flex-col items-center justify-center px-5 py-10 text-center sm:px-6 sm:py-16 transition ${over ? "border-brand bg-brand/5" : ""}`}
    >
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-card-2 sm:h-32 sm:w-32">
        <UploadCloud className="h-10 w-10 text-muted sm:h-14 sm:w-14" />
      </span>
      <p className="mt-6 text-lg font-semibold">
        <span className="lg:hidden">Select a video to upload</span>
        <span className="hidden lg:inline">Drag and drop a video file to upload</span>
      </p>
      <p className="mt-1 text-sm text-muted">Any video format works — we convert it so it plays everywhere. Videos of 2 minutes or less also appear in Shorts.</p>
      <PrimaryButton className="mt-6" onClick={() => input.current?.click()}>
        Select file
      </PrimaryButton>
      <input
        ref={input}
        type="file"
        accept={VIDEO_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onPick(file);
        }}
      />
      <p className="mt-8 text-xs text-muted">MP4, MOV, MKV, WEBM, AVI, WMV, FLV, MPG, 3GP and more · up to {MAX_UPLOAD_GB} GB</p>
    </Card>
  );
};

// A <video> that also plays HLS (videos uploaded through Bunny Stream).
const PreviewVideo = ({ src, ...rest }) => {
  const ref = useRef(null);
  useHlsSource(ref, src);
  return <video ref={ref} src={playableSrc(src)} {...rest} />;
};

// The chosen video with its length and size. Vertical clips keep their
// shape at a height that fits a phone screen.
const PreviewCard = ({ src, poster, portrait, isShort, file, durationSeconds, views, unreadable, className = "" }) => (
  <Card className={`overflow-hidden ${className}`}>
    <div className="flex justify-center bg-black">
      {unreadable ? (
        // AVI, WMV, FLV… can't play in a browser until we've converted them.
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-sm font-semibold">Preview isn't available for this format</p>
          <p className="text-xs text-muted">No problem — it's converted to MP4 after upload and plays everywhere.</p>
        </div>
      ) : (
        <PreviewVideo
          src={src}
          poster={poster}
          controls
          playsInline
          preload="metadata"
          className={portrait ? "block aspect-[9/16] h-[min(55vh,420px)] w-auto max-w-full" : "block aspect-video w-full"}
        />
      )}
    </div>
    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 p-4 text-sm lg:block lg:space-y-2">
      {isShort && (
        <span className="col-span-2 mb-1 inline-flex w-fit items-center gap-1 rounded-md bg-live/15 px-2 py-0.5 text-xs font-bold text-[#ff6b81]">
          <Zap className="h-3.5 w-3.5" /> This will appear in Shorts
        </span>
      )}
      <p className="text-muted">Filename</p>
      <p className="min-w-0 truncate">{file?.name || "Uploaded video"}</p>
      <p className="text-muted">Length · size</p>
      <p>
        {durationSeconds ? clock(durationSeconds) : "Length found after upload"}
        {file ? ` · ${formatBytes(file.size)}` : ""}
        {views !== undefined ? ` · ${viewsText(views)}` : ""}
      </p>
    </div>
  </Card>
);

const initialDetails = (video) => ({
  title: video?.title || "",
  description: video?.description || "",
  category: video?.category || "Other",
  tags: (video?.tags || []).join(", "),
  visibility: video ? (new Date(video.publishedAt) > new Date() ? "schedule" : video.visibility) : "public",
  publishAt: video && new Date(video.publishedAt) > new Date() ? toLocalInput(video.publishedAt) : "",
  allowComments: video ? video.allowComments : true,
  madeForKids: video ? Boolean(video.madeForKids) : false,
});

const DetailsForm = ({ mode, video, file, meta, onSubmit, submitting }) => {
  const [details, setDetails] = useState(() => {
    const base = initialDetails(video);
    if (mode === "create" && file) base.title = file.name.replace(/\.[^.]+$/, "").slice(0, MAX_TITLE);
    return base;
  });
  const [customThumb, setCustomThumb] = useState(null);
  const [selected, setSelected] = useState(mode === "create" ? 0 : "current");
  const previewUrl = useObjectUrl(file);

  const set = (key) => (event) => setDetails((previous) => ({ ...previous, [key]: event.target.value }));
  const frames = meta?.candidates || [];
  const durationSeconds = meta?.durationSeconds ?? video?.durationSeconds ?? 0;
  const isShort = durationSeconds > 0 && durationSeconds <= SHORT_MAX_SECONDS;

  const spec = isShort ? THUMB_SPEC.short : THUMB_SPEC.video;
  const [thumbNote, setThumbNote] = useState("");

  const chosenThumb =
    selected === "custom" ? customThumb : typeof selected === "number" ? frames[selected] || null : null;

  const preview = {
    src: previewUrl || video?.videoUrl,
    poster: mode === "edit" ? video?.thumbnail : undefined,
    portrait: (meta?.height || video?.height) > (meta?.width || video?.width),
    isShort,
    file,
    durationSeconds,
    views: mode === "edit" ? video.views : undefined,
    unreadable: Boolean(meta?.unreadable),
  };
  const actions = (
    <>
      <Link to="/videos" className="flex-1">
        <GhostButton type="button" className="w-full py-3">
          Cancel
        </GhostButton>
      </Link>
      <PrimaryButton type="submit" disabled={submitting} className="flex-[2]">
        {mode === "edit" ? "Save" : details.visibility === "schedule" ? "Schedule" : "Publish"}
      </PrimaryButton>
    </>
  );

  const submit = (event) => {
    event.preventDefault();
    if (!details.title.trim()) {
      toast.error("Add a title");
      return;
    }
    if (details.visibility === "schedule" && (!details.publishAt || new Date(details.publishAt) <= new Date())) {
      toast.error("Pick a date and time in the future");
      return;
    }
    onSubmit({ details, thumbnail: chosenThumb });
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px] [&>*]:min-w-0">
      <div className="space-y-5">
        <PreviewCard {...preview} className="lg:hidden" />
        <Card className="space-y-5 p-4 sm:p-5">
          <h2 className="text-xl font-bold">Details</h2>

          <label className="block rounded-xl border border-white/15 px-3 pb-2 pt-1.5 focus-within:border-brand/70">
            <span className="flex justify-between text-xs text-muted">
              <span>Title (required)</span>
              <Counter value={details.title.length} max={MAX_TITLE} />
            </span>
            <textarea
              rows={2}
              maxLength={MAX_TITLE}
              value={details.title}
              onChange={set("title")}
              placeholder="Add a title that describes your video"
              className="mt-1 w-full resize-none bg-transparent text-[15px] text-white outline-none placeholder:text-slate-500"
            />
          </label>

          <label className="block rounded-xl border border-white/15 px-3 pb-2 pt-1.5 focus-within:border-brand/70">
            <span className="flex justify-between text-xs text-muted">
              <span>Description</span>
              <Counter value={details.description.length} max={MAX_DESCRIPTION} />
            </span>
            <textarea
              rows={6}
              maxLength={MAX_DESCRIPTION}
              value={details.description}
              onChange={set("description")}
              placeholder="Tell viewers about your video"
              className="mt-1 w-full resize-y bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
          </label>

          <div>
            <p className="font-semibold">Thumbnail</p>
            <p className="text-sm text-muted">Set a thumbnail that stands out and draws viewers' attention.</p>
            <p className="mt-2 rounded-lg bg-card-2 px-3 py-2 text-xs text-slate-300">
              {isShort ? "Shorts thumbnail" : "Video thumbnail"}: <span className="font-semibold text-white">{spec.width} × {spec.height} px</span> ({spec.ratio}
              {isShort ? ", vertical" : ", landscape"}) · any image format, up to 100 MB
            </p>
            {thumbNote && <p className="mt-1.5 text-xs text-amber-300">{thumbNote}</p>}
            <div className={`mt-3 grid gap-2 ${isShort ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}`}>
              <label className={`flex ${spec.tile} cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-white/20 text-center text-xs text-muted hover:border-white/40`}>
                <ImagePlus className="h-6 w-6" />
                Upload file
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={async (event) => {
                    const picked = event.target.files?.[0];
                    event.target.value = "";
                    if (!picked) return;
                    const size = await imageSize(picked);
                    const wanted = spec.width / spec.height;
                    setThumbNote(
                      size && Math.abs(size.width / size.height - wanted) > 0.08
                        ? `This image is ${size.width} × ${size.height}. A ${spec.ratio} image (${spec.width} × ${spec.height}) fits best — other shapes get cropped.`
                        : "",
                    );
                    setCustomThumb(await compressImage(picked, { maxWidth: isShort ? 1080 : 1280, maxHeight: isShort ? 1920 : 1280 }));
                    setSelected("custom");
                  }}
                />
              </label>
              {customThumb && <FrameTile tile={spec.tile} file={customThumb} selected={selected === "custom"} onSelect={() => setSelected("custom")} />}
              {mode === "edit" && video?.thumbnail && (
                <FrameTile tile={spec.tile} url={video.thumbnail} selected={selected === "current"} onSelect={() => setSelected("current")} />
              )}
              {frames.map((frame, index) => (
                <FrameTile key={index} tile={spec.tile} file={frame} selected={selected === index} onSelect={() => setSelected(index)} />
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Category</span>
              <select
                value={details.category}
                onChange={set("category")}
                className="h-11 w-full cursor-pointer rounded-xl border border-white/15 bg-black/20 px-3 text-white outline-none [color-scheme:dark]"
              >
                {VIDEO_CATEGORIES.filter((item) => item.value).map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Tags</span>
              <input
                value={details.tags}
                onChange={set("tags")}
                placeholder="natok, comedy, eid special"
                className="h-11 w-full rounded-xl border border-white/15 bg-black/20 px-3 text-white outline-none placeholder:text-slate-500"
              />
            </label>
          </div>

          <div>
            <p className="font-semibold">Audience</p>
            <p className="text-sm text-muted">Is this video made for kids?</p>
            <div className="mt-2 space-y-2">
              {[
                [true, "Yes, it's made for kids"],
                [false, "No, it's not made for kids"],
              ].map(([value, label]) => (
                <label key={label} className="flex cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="radio"
                    checked={details.madeForKids === value}
                    onChange={() => setDetails((previous) => ({ ...previous, madeForKids: value }))}
                    className="h-4 w-4 accent-[#ff2d6f]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={details.allowComments}
              onChange={(event) => setDetails((previous) => ({ ...previous, allowComments: event.target.checked }))}
              className="h-4 w-4 accent-[#ff2d6f]"
            />
            Allow comments
          </label>
        </Card>
      </div>

      <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <PreviewCard {...preview} className="hidden lg:block" />

        <Card className="p-4">
          <p className="font-semibold">Visibility</p>
          <div className="mt-3 space-y-2">
            {VISIBILITY.map(({ key, label, hint, icon: Icon }) => (
              <label
                key={key}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                  details.visibility === key ? "border-brand/60 bg-brand/10" : "border-line hover:bg-white/[0.03]"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  checked={details.visibility === key}
                  onChange={() => setDetails((previous) => ({ ...previous, visibility: key }))}
                  className="mt-1 h-4 w-4 accent-[#ff2d6f]"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon className="h-4 w-4" /> {label}
                  </span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </label>
            ))}
            {details.visibility === "schedule" && (
              <input
                type="datetime-local"
                value={details.publishAt}
                min={toLocalInput(new Date())}
                onChange={set("publishAt")}
                className="h-11 w-full rounded-xl border border-white/15 bg-black/20 px-3 text-white outline-none [color-scheme:dark]"
              />
            )}
          </div>
        </Card>

        <div className="hidden gap-3 lg:flex">{actions}</div>
      </div>

      {/* On phones the buttons stay in reach above the bottom bar. */}
      <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 flex gap-3 rounded-2xl border border-line bg-page/90 p-2 shadow-2xl backdrop-blur lg:hidden">
        {actions}
      </div>
    </form>
  );
};

// `publishAt` is only sent when it should change: a schedule, a brand-new
// upload, or a scheduled video being released now — never on a plain edit,
// which would otherwise reset the publish date.
const toFormData = ({ details, thumbnail }, { releaseNow = true } = {}) => {
  const body = new FormData();
  body.append("title", details.title.trim());
  body.append("description", details.description);
  body.append("category", details.category);
  body.append("tags", JSON.stringify(details.tags.split(",").map((tag) => tag.trim()).filter(Boolean)));
  body.append("allowComments", String(details.allowComments));
  body.append("madeForKids", String(details.madeForKids));
  if (details.visibility === "schedule") {
    body.append("visibility", "public");
    body.append("publishAt", new Date(details.publishAt).toISOString());
  } else {
    body.append("visibility", details.visibility);
    if (releaseNow) body.append("publishAt", new Date().toISOString());
  }
  if (thumbnail) body.append("thumbnail", thumbnail);
  return body;
};

// Upload (mode="create") or edit (mode="edit") a video, YouTube-style.
const VideoEditor = ({ mode }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === "edit";

  const { data, loading, error } = useFetch(isEdit ? `/api/studio/videos/${id}` : null, undefined, studioApi);
  const video = data?.video;

  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState(null);
  const [reading, setReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState(null);
  const { upload, start, reportSent, complete, fail, cancel, reset } = useUploadProgress();

  const pick = async (picked) => {
    if (!isVideoFile(picked)) {
      toast.error("That isn't a video file");
      return;
    }
    if (picked.size > MAX_UPLOAD_GB * 1024 ** 3) {
      toast.error(`Videos can be up to ${MAX_UPLOAD_GB} GB`);
      return;
    }
    setReading(true);
    try {
      // The browser reads what it can (length, size, thumbnail frames). Some
      // formats (AVI, WMV, FLV…) it can't — they still upload; the server
      // works all of that out while converting.
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000));
      const info = await Promise.race([inspectVideo(picked), timeout]).catch(() => null);
      setFile(picked);
      setMeta(info?.durationSeconds ? info : { durationSeconds: 0, width: 0, height: 0, candidates: [], unreadable: true });
    } finally {
      setReading(false);
    }
  };

  const publish = async (payload) => {
    const wasScheduled = isEdit && new Date(video.publishedAt) > new Date();
    const body = toFormData(payload, { releaseNow: !isEdit || wasScheduled });
    setSubmitting(true);

    if (isEdit) {
      try {
        await studioApi.patch(`/api/studio/videos/${id}`, body);
        toast.success("Changes saved");
        navigate("/videos");
      } catch (err) {
        toast.error(apiError(err, "Couldn't save changes"));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // 1) the file goes up — straight to Bunny Stream (the percentage is
    //    exactly that),
    // 2) the video is created — that's 100%. Converting and saving to
    //    storage then happen on the server in the background, like YouTube:
    //    nobody has to wait for it, and My videos shows when it's live.
    try {
      const signal = start({ fileName: file.name, fileSize: file.size });
      const uploaded = await uploadVideoFile(file, { signal, onProgress: (sent, total) => reportSent(sent, total) });
      Object.entries(uploaded).forEach(([key, value]) => body.append(key, value));
      const { data: result } = await studioApi.post("/api/studio/videos", body, { signal });

      await complete();
      // Let the finished ring show for a moment before the share screen.
      await new Promise((resolve) => setTimeout(resolve, 500));
      setPublished(result.data.video);
    } catch (err) {
      if (isUploadCancelled(err)) {
        reset();
        toast.info("Upload cancelled");
      } else {
        fail(apiError(err, err.message || "Upload failed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (isEdit && error) {
    return (
      <EmptyState title="Couldn't load this video" text={apiError(error, "It may have been deleted.")}>
        <Link to="/videos" className="text-sm font-semibold text-brand">
          Back to your videos
        </Link>
      </EmptyState>
    );
  }
  if (isEdit && (loading || !video)) return <Spinner className="min-h-[60vh]" />;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-5 text-2xl font-bold sm:text-3xl">{isEdit ? "Video details" : file ? "Upload video" : "Upload video"}</h1>

      {!isEdit && !file ? (
        reading ? (
          <Card className="flex flex-col items-center py-20 text-center">
            <Spinner className="py-0" />
            <p className="mt-4 text-sm text-muted">Reading your video…</p>
          </Card>
        ) : (
          <PickFile onPick={pick} />
        )
      ) : (
        <DetailsForm mode={mode} video={video} file={file} meta={meta} onSubmit={publish} submitting={submitting} />
      )}

      <UploadFlow
        upload={upload}
        file={file}
        portrait={(meta?.height || 0) > (meta?.width || 0)}
        published={published}
        onCancel={cancel}
        onRetry={reset}
        onDone={() => {
          reset();
          navigate("/videos");
        }}
      />
    </div>
  );
};

export default VideoEditor;
