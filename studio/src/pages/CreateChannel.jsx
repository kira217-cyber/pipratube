import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { AtSign, Camera, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Avatar, Card, PrimaryButton, inputClass } from "../components/ui/ui";
import { apiError, studioApi } from "../api/studioApi";
import { useAuth } from "../context/AuthContext";
import { compressImage, IMAGE_ACCEPT } from "../utils/media";
import { toast } from "../utils/alerts";

const suggestHandle = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, "")
    .slice(0, 24);

// "How you'll appear" — YouTube's create-a-channel step: picture, name, @handle.
const CreateChannel = () => {
  const { user, channel, setChannel } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState(user?.name || "");
  const [handle, setHandle] = useState(() => suggestHandle(user?.name));
  const [handleTouched, setHandleTouched] = useState(false);
  const [avatar, setAvatar] = useState(null);
  const [check, setCheck] = useState({ handle: "", state: "idle", reason: "" });
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => (avatar ? URL.createObjectURL(avatar) : null), [avatar]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  // Live "is this @handle free?" check, debounced.
  useEffect(() => {
    const value = handle.trim();
    if (value.length < 3) return undefined;
    const timer = setTimeout(() => {
      studioApi
        .get("/api/channels/handle-available", { params: { handle: value } })
        .then(({ data }) =>
          setCheck({ handle: value, state: data.data.available ? "ok" : "taken", reason: data.data.reason || "" }),
        )
        .catch(() => setCheck({ handle: value, state: "idle", reason: "" }));
    }, 400);
    return () => clearTimeout(timer);
  }, [handle]);

  // Already has one (or just made it): carry on to wherever they were going.
  const destination = location.state?.from || "/";
  if (channel) return <Navigate to={destination} replace />;

  const handleState = handle.trim().length < 3 ? "short" : check.handle === handle.trim() ? check.state : "checking";

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Give your channel a name");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("handle", handle.trim());
      if (avatar) form.append("avatar", avatar);
      const { data } = await studioApi.post("/api/channels", form);
      setChannel(data.data.channel);
      toast.success("Your channel is ready!");
      navigate(destination, { replace: true });
    } catch (error) {
      toast.error(apiError(error, "Couldn't create the channel"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-4">
      <Card className="w-full max-w-lg p-6 sm:p-8">
        <h1 className="text-center text-2xl font-bold">How you'll appear</h1>
        <p className="mt-1 text-center text-sm text-muted">Create your channel to start uploading videos and Shorts.</p>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="flex flex-col items-center gap-2">
            <Avatar src={preview} name={name || "P"} size="h-28 w-28" />
            <label className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-[#3ea6ff] hover:underline">
              <Camera className="h-4 w-4" /> Select picture <span className="font-normal text-muted">(800 × 800 px)</span>
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
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Name</span>
            <span className="flex items-center rounded-xl border border-white/15 bg-black/20 px-3 focus-within:border-brand/70">
              <input
                required
                maxLength={60}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!handleTouched) setHandle(suggestHandle(event.target.value));
                }}
                className={inputClass}
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Handle</span>
            <span className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/20 px-3 focus-within:border-brand/70">
              <AtSign className="h-5 w-5 shrink-0 text-muted" />
              <input
                required
                maxLength={30}
                value={handle}
                onChange={(event) => {
                  setHandleTouched(true);
                  setHandle(event.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""));
                }}
                className={inputClass}
              />
              {handleState === "checking" && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted" />}
              {handleState === "ok" && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#22c55e]" />}
              {handleState === "taken" && <XCircle className="h-5 w-5 shrink-0 text-live" />}
            </span>
            <span className={`mt-1 block text-xs ${handleState === "taken" ? "text-[#f87171]" : "text-muted"}`}>
              {handleState === "taken"
                ? check.reason
                : handleState === "short"
                  ? "At least 3 letters, numbers, dots or underscores"
                  : `pipratv.com/@${handle}`}
            </span>
          </label>

          <p className="text-xs leading-relaxed text-muted">
            By creating a channel you agree to PipraTube's terms. You can change your name, handle and picture any time.
          </p>

          <PrimaryButton type="submit" disabled={busy || handleState !== "ok"} className="w-full">
            {busy ? "Creating..." : "Create channel"}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
};

export default CreateChannel;
