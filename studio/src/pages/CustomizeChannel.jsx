import React, { useEffect, useMemo, useState } from "react";
import { AtSign, ExternalLink, ImagePlus, Link2, Plus, Trash2 } from "lucide-react";

import { Avatar, Card, GhostButton, PrimaryButton, SiteLink, inputClass } from "../components/ui/ui";
import { apiError, studioApi } from "../api/studioApi";
import { useAuth } from "../context/AuthContext";
import { compressImage, IMAGE_ACCEPT } from "../utils/media";
import { channelPath } from "../utils/format";
import { toast } from "../utils/alerts";

const CATEGORIES = ["Entertainment", "Movies", "Natok & Drama", "Music", "Kids", "Sports", "News", "Education", "Comedy", "Gaming", "Lifestyle", "Food", "Travel", "Tech", "Religion", "Other"];
const LANGUAGES = ["Bangla", "English", "Hindi", "Urdu", "Arabic", "Other"];
const COUNTRIES = ["Bangladesh", "India", "Saudi Arabia", "United Arab Emirates", "Malaysia", "United Kingdom", "United States", "Other"];

const TABS = [
  { key: "branding", label: "Branding" },
  { key: "basic", label: "Basic info" },
];

const useObjectUrl = (file) => {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
};

const Section = ({ title, size, hint, children }) => (
  <div className="border-b border-line py-6 last:border-0">
    <p className="flex flex-wrap items-center gap-2 font-semibold">
      {title}
      {size && <span className="rounded-md bg-brand/15 px-2 py-0.5 text-xs font-semibold text-pink-300">{size}</span>}
    </p>
    {hint && <p className="mt-1 max-w-2xl text-sm text-muted">{hint}</p>}
    <div className="mt-4">{children}</div>
  </div>
);

const fromChannel = (channel) => ({
  name: channel.name || "",
  handle: channel.handle || "",
  description: channel.description || "",
  contactEmail: channel.contactEmail || "",
  category: channel.category || "Entertainment",
  language: channel.language || "Bangla",
  country: channel.country || "Bangladesh",
  links: channel.links?.length ? channel.links : [],
});

// YouTube Studio → Customization: branding (picture, banner) and basic
// info (name, handle, description, links, contact).
const CustomizeChannel = () => {
  const { channel, setChannel } = useAuth();
  const [tab, setTab] = useState("branding");
  const [form, setForm] = useState(() => fromChannel(channel));
  const [avatar, setAvatar] = useState(null);
  const [banner, setBanner] = useState(null);
  const [remove, setRemove] = useState({ avatar: false, banner: false });
  const [busy, setBusy] = useState(false);

  const avatarPreview = useObjectUrl(avatar);
  const bannerPreview = useObjectUrl(banner);
  const shownAvatar = avatarPreview || (remove.avatar ? null : channel.avatar);
  const shownBanner = bannerPreview || (remove.banner ? null : channel.banner);

  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const dirty =
    Boolean(avatar || banner || remove.avatar || remove.banner) ||
    JSON.stringify(form) !== JSON.stringify(fromChannel(channel));

  const cancel = () => {
    setForm(fromChannel(channel));
    setAvatar(null);
    setBanner(null);
    setRemove({ avatar: false, banner: false });
  };

  const publish = async () => {
    const links = form.links.filter((link) => link.url.trim());
    if (links.some((link) => !/^https?:\/\//i.test(link.url.trim()))) {
      toast.error("Links must start with https://");
      setTab("basic");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      Object.entries({ ...form, links: JSON.stringify(links) }).forEach(([key, value]) => body.append(key, value));
      if (avatar) body.append("avatar", avatar);
      if (banner) body.append("banner", banner);
      if (remove.avatar && !avatar) body.append("remove_avatar", "1");
      if (remove.banner && !banner) body.append("remove_banner", "1");
      const { data } = await studioApi.patch("/api/channels/me", body);
      setChannel(data.data.channel);
      setForm(fromChannel(data.data.channel));
      setAvatar(null);
      setBanner(null);
      setRemove({ avatar: false, banner: false });
      toast.success("Changes published");
    } catch (error) {
      toast.error(apiError(error, "Couldn't save your channel"));
    } finally {
      setBusy(false);
    }
  };

  const pick = (setter, key, size) => async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setter(await compressImage(file, size));
    setRemove((previous) => ({ ...previous, [key]: false }));
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Channel customization</h1>
        <div className="flex gap-2">
          <SiteLink
            to={channelPath(channel)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#3ea6ff] hover:bg-white/5"
          >
            View channel <ExternalLink className="h-4 w-4" />
          </SiteLink>
          <GhostButton onClick={cancel} disabled={!dirty || busy}>
            Cancel
          </GhostButton>
          <PrimaryButton onClick={publish} disabled={!dirty || busy} className="py-2.5 text-sm">
            {busy ? "Publishing..." : "Publish"}
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-line">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`cursor-pointer border-b-[3px] px-4 py-3 text-sm font-semibold transition ${
              tab === item.key ? "border-white text-white" : "border-transparent text-muted hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card className="mt-4 px-4 sm:px-6">
        {tab === "branding" ? (
          <>
            <Section title="Picture" size="800 × 800 px · square" hint="Your profile picture appears next to your videos, comments and Shorts. Use a square image of at least 98×98 pixels.">
              <div className="flex flex-wrap items-center gap-5">
                <div className="flex h-36 w-60 items-center justify-center rounded-xl bg-card-2">
                  <Avatar src={shownAvatar} name={form.name} size="h-28 w-28" ring={false} />
                </div>
                <div className="flex gap-2">
                  <label className="cursor-pointer rounded-xl border border-line bg-card-2 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">
                    Change
                    <input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={pick(setAvatar, "avatar", { maxWidth: 512, maxHeight: 512 })} />
                  </label>
                  {shownAvatar && (
                    <GhostButton
                      onClick={() => {
                        setAvatar(null);
                        setRemove((previous) => ({ ...previous, avatar: true }));
                      }}
                    >
                      Remove
                    </GhostButton>
                  )}
                </div>
              </div>
            </Section>

            <Section title="Banner image" size="2560 × 1440 px · 16:9" hint="This image appears across the top of your channel. For the best results on all devices use an image that's at least 2048×1152 pixels.">
              <div className="flex flex-wrap items-center gap-5">
                <div className="relative flex aspect-[16/5] w-full max-w-md items-center justify-center overflow-hidden rounded-xl bg-card-2">
                  {shownBanner ? (
                    <img src={shownBanner} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImagePlus className="h-10 w-10 text-muted" />
                  )}
                </div>
                <div className="flex gap-2">
                  <label className="cursor-pointer rounded-xl border border-line bg-card-2 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">
                    {shownBanner ? "Change" : "Upload"}
                    <input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={pick(setBanner, "banner", { maxWidth: 2560, maxHeight: 1440 })} />
                  </label>
                  {shownBanner && (
                    <GhostButton
                      onClick={() => {
                        setBanner(null);
                        setRemove((previous) => ({ ...previous, banner: true }));
                      }}
                    >
                      Remove
                    </GhostButton>
                  )}
                </div>
              </div>
            </Section>
          </>
        ) : (
          <>
            <Section title="Name" hint="Choose a channel name that represents you and your content.">
              <input value={form.name} onChange={set("name")} maxLength={60} className={`${inputClass} rounded-xl border border-white/15 bg-black/20 px-3`} />
            </Section>

            <Section title="Handle" hint="Choose your unique handle by adding letters and numbers. You can change it back within 14 days.">
              <span className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/20 px-3">
                <AtSign className="h-5 w-5 text-muted" />
                <input
                  value={form.handle}
                  onChange={(event) => setForm((previous) => ({ ...previous, handle: event.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "") }))}
                  maxLength={30}
                  className={inputClass}
                />
              </span>
              <p className="mt-1 text-xs text-muted">pipratv.com/@{form.handle}</p>
            </Section>

            <Section title="Description">
              <textarea
                value={form.description}
                onChange={set("description")}
                maxLength={1000}
                rows={5}
                placeholder="Tell viewers about your channel"
                className="w-full resize-y rounded-xl border border-white/15 bg-black/20 p-3 text-white outline-none placeholder:text-slate-500 focus:border-brand/70"
              />
              <p className="text-right text-xs text-muted">{form.description.length}/1000</p>
            </Section>

            <Section title="Links" hint="Share external links with your viewers. They'll be visible on your channel profile and about page.">
              <div className="space-y-2">
                {form.links.map((link, index) => (
                  <div key={index} className="flex flex-wrap gap-2 sm:flex-nowrap">
                    <input
                      value={link.title}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          links: previous.links.map((item, i) => (i === index ? { ...item, title: event.target.value } : item)),
                        }))
                      }
                      placeholder="Link title (e.g. Facebook)"
                      maxLength={40}
                      className="h-11 w-full rounded-xl border border-white/15 bg-black/20 px-3 text-sm text-white outline-none sm:w-48"
                    />
                    <span className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/15 bg-black/20 px-3">
                      <Link2 className="h-4 w-4 shrink-0 text-muted" />
                      <input
                        value={link.url}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            links: previous.links.map((item, i) => (i === index ? { ...item, url: event.target.value } : item)),
                          }))
                        }
                        placeholder="https://"
                        className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
                      />
                    </span>
                    <button
                      type="button"
                      aria-label="Remove link"
                      onClick={() => setForm((previous) => ({ ...previous, links: previous.links.filter((_, i) => i !== index) }))}
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-muted hover:bg-white/5 hover:text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {form.links.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setForm((previous) => ({ ...previous, links: [...previous.links, { title: "", url: "" }] }))}
                    className="flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[#3ea6ff] hover:bg-white/5"
                  >
                    <Plus className="h-4 w-4" /> Add link
                  </button>
                )}
              </div>
            </Section>

            <Section title="Details">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Contact email (for business enquiries)</span>
                  <input type="email" value={form.contactEmail} onChange={set("contactEmail")} className={`${inputClass} rounded-xl border border-white/15 bg-black/20 px-3`} />
                </label>
                {[
                  ["category", "Category", CATEGORIES],
                  ["language", "Language", LANGUAGES],
                  ["country", "Country", COUNTRIES],
                ].map(([key, label, options]) => (
                  <label key={key} className="block">
                    <span className="mb-1.5 block text-sm text-muted">{label}</span>
                    <select value={form[key]} onChange={set(key)} className={`${inputClass} cursor-pointer rounded-xl border border-white/15 bg-black/20 px-3`}>
                      {options.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </Section>
          </>
        )}
      </Card>
    </div>
  );
};

export default CustomizeChannel;
