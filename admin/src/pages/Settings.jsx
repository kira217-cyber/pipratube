import React, { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import { Card, PageHeader, Spinner } from "../components/ui";
import { Btn, TextInput, Toggle } from "../components/kit";
import { apiError, get, send } from "../api/client";
import { compressImage, IMAGE_ACCEPT } from "../utils/media";
import { toast } from "../utils/alerts";

const SOCIAL = ["facebook", "youtube", "telegram", "instagram", "tiktok"];

const ImagePick = ({ label, size, current, file, onPick, onRemove, square, maxWidth = 800 }) => {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : current), [file, current]);
  return (
    <div>
      <p className="mb-1.5 text-sm text-muted">
        {label} {size && <span className="text-xs text-slate-400">· {size}</span>}
      </p>
      <div className="flex items-center gap-3">
        <span className={`flex items-center justify-center overflow-hidden rounded-xl bg-card-2 p-2 ${square ? "h-16 w-16" : "h-16 w-40"}`}>
          {preview ? <img src={preview} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted">Default</span>}
        </span>
        <label className="cursor-pointer rounded-xl border border-line bg-card-2 px-3 py-2 text-sm font-semibold hover:bg-white/10">
          Change
          <input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={async (e) => e.target.files?.[0] && onPick(await compressImage(e.target.files[0], { maxWidth, maxHeight: 800 }))} />
        </label>
        {(current || file) && (
          <Btn tone="plain" onClick={onRemove}>
            Use default
          </Btn>
        )}
      </div>
    </div>
  );
};

const Settings = () => {
  const [s, setS] = useState(null);
  const [files, setFiles] = useState({ logo: null, favicon: null });
  const [remove, setRemove] = useState({ logo: false, favicon: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get("/api/admin/site/settings")
      .then((d) => setS(d.settings))
      .catch(() => setS(false));
  }, []);

  if (s === null) return <Spinner className="min-h-[50vh]" />;
  if (s === false) return <p className="text-muted">Couldn't load settings.</p>;

  const save = async () => {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("siteName", s.siteName);
      body.append("contactEmail", s.contactEmail || "");
      body.append("socialLinks", JSON.stringify(s.socialLinks));
      body.append("footerLinks", JSON.stringify(s.footerLinks.filter((l) => l.label && l.url)));
      body.append("announcement", JSON.stringify(s.announcement));
      for (const key of ["logo", "favicon"]) {
        if (files[key]) body.append(key, files[key]);
        else if (remove[key]) body.append(`remove_${key}`, "1");
      }
      const data = await send("patch", "/api/admin/site/settings", body);
      setS(data.settings);
      setFiles({ logo: null, favicon: null });
      setRemove({ logo: false, favicon: false });
      toast.success("Settings saved");
    } catch (error) {
      toast.error(apiError(error, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Site settings">
        <Btn tone="primary" onClick={save} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save"}
        </Btn>
      </PageHeader>

      <Card className="space-y-4 p-4">
        <p className="font-semibold">Brand</p>
        <TextInput label="Site name" placeholder="PipraTube" value={s.siteName} onChange={(e) => setS({ ...s, siteName: e.target.value })} />
        <ImagePick
          label="Logo (header)"
          size="900 × 240 px, wide, transparent PNG/WebP"
          maxWidth={1800}
          current={remove.logo ? null : s.logo}
          file={files.logo}
          onPick={(f) => setFiles((x) => ({ ...x, logo: f }))}
          onRemove={() => {
            setFiles((x) => ({ ...x, logo: null }));
            setRemove((r) => ({ ...r, logo: true }));
          }}
        />
        <ImagePick
          square
          label="Favicon (browser tab)"
          size="512 × 512 px, square PNG"
          current={remove.favicon ? null : s.favicon}
          file={files.favicon}
          onPick={(f) => setFiles((x) => ({ ...x, favicon: f }))}
          onRemove={() => {
            setFiles((x) => ({ ...x, favicon: null }));
            setRemove((r) => ({ ...r, favicon: true }));
          }}
        />
        <TextInput label="Contact email" placeholder="support@pipratv.com" type="email" value={s.contactEmail || ""} onChange={(e) => setS({ ...s, contactEmail: e.target.value })} />
      </Card>

      <Card className="space-y-3 p-4">
        <p className="font-semibold">Announcement bar</p>
        <p className="text-sm text-muted">A one-line notice across the top of the site — events, maintenance, new features.</p>
        <TextInput label="Text" placeholder="e.g. New episodes every Friday at 9 PM" value={s.announcement?.text || ""} maxLength={200} onChange={(e) => setS({ ...s, announcement: { ...s.announcement, text: e.target.value } })} />
        <TextInput label="Link (optional)" placeholder="https://…" value={s.announcement?.url || ""} onChange={(e) => setS({ ...s, announcement: { ...s.announcement, url: e.target.value } })} />
        <Toggle on={Boolean(s.announcement?.enabled)} onChange={(v) => setS({ ...s, announcement: { ...s.announcement, enabled: v } })} label="Show on site" />
      </Card>

      <Card className="space-y-3 p-4">
        <p className="font-semibold">Social links</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL.map((key) => (
            <TextInput key={key} label={key[0].toUpperCase() + key.slice(1)} value={s.socialLinks?.[key] || ""} placeholder="https://" onChange={(e) => setS({ ...s, socialLinks: { ...s.socialLinks, [key]: e.target.value } })} />
          ))}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Footer links</p>
          <Btn onClick={() => setS({ ...s, footerLinks: [...s.footerLinks, { label: "", url: "" }] })}>
            <Plus className="h-4 w-4" /> Add
          </Btn>
        </div>
        {s.footerLinks.length === 0 && <p className="text-sm text-muted">No footer links.</p>}
        {s.footerLinks.map((link, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="w-40">
              <TextInput label="Label" placeholder="e.g. Privacy policy" value={link.label} onChange={(e) => setS({ ...s, footerLinks: s.footerLinks.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)) })} />
            </div>
            <div className="flex-1">
              <TextInput label="URL" placeholder="https://…" value={link.url} onChange={(e) => setS({ ...s, footerLinks: s.footerLinks.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)) })} />
            </div>
            <Btn tone="plain" onClick={() => setS({ ...s, footerLinks: s.footerLinks.filter((_, j) => j !== i) })} aria-label="Remove link">
              <Trash2 className="h-4 w-4" />
            </Btn>
          </div>
        ))}
      </Card>
    </div>
  );
};

export default Settings;
