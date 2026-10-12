import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Camera, KeyRound, Lock, Mail, Phone, Save, UserRound } from "lucide-react";

import { Avatar, Card, Field, GhostButton, PageHeader, PasswordInput, PrimaryButton, inputClass, SiteLink } from "../components/ui/ui";
import { apiError, studioApi, TOKEN_KEY } from "../api/studioApi";
import { useAuth } from "../context/AuthContext";
import { compressImage, IMAGE_ACCEPT } from "../utils/media";
import { channelPath, fullDate } from "../utils/format";
import { toast } from "../utils/alerts";

// Account settings: the person, not the channel (that's Customize channel).
const Profile = () => {
  const { user, channel, setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name || "", email: user.email || "", phone: user.phone || "" });
  const [avatar, setAvatar] = useState(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwBusy, setPwBusy] = useState(false);

  const preview = useMemo(() => (avatar ? URL.createObjectURL(avatar) : null), [avatar]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));
  const credentialsChanged = form.email.trim() !== (user.email || "") || form.phone.trim() !== (user.phone || "");
  const dirty = Boolean(avatar) || form.name.trim() !== user.name || credentialsChanged;

  const save = async (event) => {
    event.preventDefault();
    if (credentialsChanged && !currentPassword) {
      toast.error("Enter your current password to change email or phone");
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.append("name", form.name.trim());
      body.append("email", form.email.trim());
      body.append("phone", form.phone.trim());
      if (credentialsChanged) body.append("currentPassword", currentPassword);
      if (avatar) body.append("avatar", avatar);
      const { data } = await studioApi.patch("/api/auth/me", body);
      setUser(data.data.user);
      setAvatar(null);
      setCurrentPassword("");
      toast.success("Account updated");
    } catch (error) {
      toast.error(apiError(error, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPwBusy(true);
    try {
      const { data } = await studioApi.post("/api/auth/password", { currentPassword: pw.current, newPassword: pw.next });
      localStorage.setItem(TOKEN_KEY, data.data.token);
      setPw({ current: "", next: "" });
      toast.success("Password changed — other devices were signed out");
    } catch (error) {
      toast.error(apiError(error, "Couldn't change password"));
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Account" subtitle={`Member since ${fullDate(user.createdAt)}`} />

      <Card className="p-5">
        <form onSubmit={save} className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="relative cursor-pointer" title="Change picture">
              <Avatar src={preview || user.avatar} name={form.name} size="h-20 w-20" />
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted">512 × 512 px</span>
              <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-card-2">
                <Camera className="h-4 w-4" />
              </span>
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) setAvatar(await compressImage(file, { maxWidth: 512, maxHeight: 512 }));
                }}
              />
            </label>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{user.name}</p>
              {channel ? (
                <SiteLink to={channelPath(channel)} className="text-sm text-[#3ea6ff] hover:underline">
                  @{channel.handle}
                </SiteLink>
              ) : (
                <Link to="/channel/create" className="text-sm text-[#3ea6ff] hover:underline">
                  Create a channel
                </Link>
              )}
            </div>
          </div>

          <Field label="Name" icon={UserRound}>
            <input value={form.name} onChange={set("name")} maxLength={80} placeholder="Your name" className={inputClass} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" icon={Mail}>
              <input type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" className={inputClass} />
            </Field>
            <Field label="Phone" icon={Phone}>
              <input type="tel" value={form.phone} onChange={set("phone")} placeholder="01XXXXXXXXX" className={inputClass} />
            </Field>
          </div>
          {credentialsChanged && (
            <Field label="Current password (needed to change email or phone)" icon={Lock} required>
              <PasswordInput value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Your current password" autoComplete="current-password" />
            </Field>
          )}

          <div className="flex gap-3">
            <PrimaryButton type="submit" disabled={!dirty || saving}>
              <Save className="h-5 w-5" /> {saving ? "Saving..." : "Save changes"}
            </PrimaryButton>
            <GhostButton
              type="button"
              disabled={!dirty || saving}
              onClick={() => {
                setForm({ name: user.name || "", email: user.email || "", phone: user.phone || "" });
                setAvatar(null);
                setCurrentPassword("");
              }}
            >
              Cancel
            </GhostButton>
          </div>
        </form>
      </Card>

      <Card className="p-5">
        <p className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-5 w-5 text-brand" /> Change password
        </p>
        <form onSubmit={changePassword} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Current password" icon={Lock} required>
            <PasswordInput required value={pw.current} onChange={(event) => setPw((p) => ({ ...p, current: event.target.value }))} placeholder="Your current password" autoComplete="current-password" />
          </Field>
          <Field label="New password" icon={Lock} required>
            <PasswordInput required minLength={6} value={pw.next} onChange={(event) => setPw((p) => ({ ...p, next: event.target.value }))} placeholder="At least 6 characters" autoComplete="new-password" />
          </Field>
          <div className="sm:col-span-2">
            <GhostButton type="submit" disabled={pwBusy}>
              {pwBusy ? "Changing..." : "Change password"}
            </GhostButton>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default Profile;
