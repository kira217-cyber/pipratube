import React, { useEffect, useState } from "react";
import { Mail, Phone, Save, Send, ShieldCheck, UserPlus } from "lucide-react";

import { Card, PageHeader, Spinner } from "../components/ui";
import { Btn, TextInput, Toggle } from "../components/kit";
import { apiError, get, send } from "../api/client";
import { toast } from "../utils/alerts";

// Admin → Sign-up & OTP: how people may create an account and sign in
// (phone, email, both, or sign-ups paused), whether the number / address
// must be confirmed with a code, and the SMS / mail services that send them.
const API = "/api/admin/site/auth-settings";

const MethodCard = ({ icon: Icon, title, method, value, onChange, ready, readyHint }) => (
  <Card className="p-5">
    <div className="flex items-center gap-2">
      <Icon className="h-5 w-5 text-brand" />
      <p className="text-lg font-bold">{title}</p>
    </div>
    <div className="mt-4 space-y-3">
      <Toggle on={value.register} onChange={(v) => onChange({ ...value, register: v })} label={`Sign up with ${method}`} />
      <Toggle on={value.login} onChange={(v) => onChange({ ...value, login: v })} label={`Sign in with ${method}`} />
      <Toggle on={value.otp} onChange={(v) => onChange({ ...value, otp: v })} label={`Confirm ${method} with a code (OTP)`} />
    </div>
    {value.register && value.otp && !ready && (
      <p className="mt-3 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
        Sign-up with {method} stays closed until {readyHint} is set up below.
      </p>
    )}
    {value.register && !value.otp && (
      <p className="mt-3 rounded-lg bg-live/10 px-3 py-2 text-xs text-[#ff8a9a]">Without a code, bots can create accounts with made-up {method === "phone" ? "numbers" : "addresses"}.</p>
    )}
  </Card>
);

const SignupSettings = () => {
  const [auth, setAuth] = useState(null);
  const [draft, setDraft] = useState(null);
  const [smsKey, setSmsKey] = useState("");
  const [smtp, setSmtp] = useState(null);
  const [testTo, setTestTo] = useState({ phone: "", email: "" });
  const [busy, setBusy] = useState("");

  const apply = (data) => {
    setAuth(data);
    setDraft({ registrationOpen: data.registrationOpen, phone: data.phone, email: data.email, dailyOtpLimit: data.dailyOtpLimit });
    setSmtp({ host: data.smtp.host, port: data.smtp.port, secure: data.smtp.secure, user: data.smtp.user, pass: "", from: data.smtp.from });
  };

  useEffect(() => {
    get(API)
      .then((data) => apply(data.auth))
      .catch((error) => toast.error(apiError(error, "Couldn't load")));
  }, []);

  const run = async (key, call, message) => {
    setBusy(key);
    try {
      const data = await call();
      apply(data.auth);
      toast.success(message);
    } catch (error) {
      toast.error(apiError(error, "Something went wrong"));
      get(API).then((data) => apply(data.auth)).catch(() => {});
    } finally {
      setBusy("");
    }
  };

  if (!auth || !draft) return <Spinner />;

  const options = auth.options;
  const summary = !options.registrationOpen
    ? "Sign-ups are paused — nobody can create an account."
    : options.phone.register && options.email.register
      ? "New accounts: phone or email."
      : options.phone.register
        ? "New accounts: phone number only."
        : options.email.register
          ? "New accounts: email only."
          : "No sign-up method is available — nobody can create an account.";

  return (
    <div className="space-y-5">
      <PageHeader title="Sign-up & OTP" subtitle="How people create an account and sign in" />

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <UserPlus className="h-6 w-6 text-brand" />
          <div>
            <p className="font-bold">Allow new sign-ups</p>
            <p className="text-sm text-muted">Live now: {summary}</p>
          </div>
        </div>
        <Toggle on={draft.registrationOpen} onChange={(v) => setDraft((d) => ({ ...d, registrationOpen: v }))} label={draft.registrationOpen ? "Open" : "Paused"} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <MethodCard icon={Phone} title="Phone number" method="phone" value={draft.phone} onChange={(v) => setDraft((d) => ({ ...d, phone: v }))} ready={auth.sms.hasKey} readyHint="the SMS key" />
        <MethodCard icon={Mail} title="Email" method="email" value={draft.email} onChange={(v) => setDraft((d) => ({ ...d, email: v }))} ready={auth.smtp.ready} readyHint="the mail server" />
      </div>

      <Card className="flex flex-wrap items-end gap-4 p-5">
        <div className="w-56">
          <TextInput
            label="Most codes per day"
            type="number"
            min={1}
            value={draft.dailyOtpLimit}
            onChange={(e) => setDraft((d) => ({ ...d, dailyOtpLimit: e.target.value }))}
            hint="Stops a flood from using up SMS credit"
          />
        </div>
        <Btn tone="primary" disabled={busy === "save"} onClick={() => run("save", () => send("put", API, draft), "Sign-up settings saved")}>
          <Save className="h-4 w-4" /> {busy === "save" ? "Saving…" : "Save sign-up settings"}
        </Btn>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand" />
            <p className="text-lg font-bold">SMS codes (o-sms.com)</p>
          </div>
          <p className="text-sm text-muted">
            Key: {auth.sms.hasKey ? <span className="font-semibold text-[#4ade80]">set ({auth.sms.keyPreview})</span> : <span className="font-semibold text-amber-300">not set</span>}
            {auth.sms.lastTestedAt && (auth.sms.lastTestError ? <span className="block text-[#ff8a9a]">Last test failed: {auth.sms.lastTestError}</span> : <span className="block text-[#4ade80]">Last test worked</span>)}
          </p>
          <TextInput label="API key" type="password" value={smsKey} onChange={(e) => setSmsKey(e.target.value)} placeholder={auth.sms.hasKey ? "Enter a new key to replace it" : "Paste the o-sms API key"} autoComplete="off" />
          <div className="flex flex-wrap gap-2">
            <Btn tone="primary" disabled={!smsKey.trim() || busy === "sms"} onClick={() => run("sms", () => send("put", `${API}/sms`, { apiKey: smsKey.trim() }), "SMS key saved").then(() => setSmsKey(""))}>
              <Save className="h-4 w-4" /> Save key
            </Btn>
            {auth.sms.hasKey && (
              <Btn onClick={() => run("sms", () => send("put", `${API}/sms`, { apiKey: "" }), "SMS key removed")}>Remove key</Btn>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <div className="min-w-48 flex-1">
              <TextInput label="Send a test code to" value={testTo.phone} onChange={(e) => setTestTo((t) => ({ ...t, phone: e.target.value }))} placeholder="01XXXXXXXXX" />
            </div>
            <Btn disabled={!auth.sms.hasKey || !testTo.phone || busy === "test-phone"} onClick={() => run("test-phone", () => send("post", `${API}/test`, { channel: "phone", to: testTo.phone }), "Test SMS sent")}>
              <Send className="h-4 w-4" /> Send test SMS
            </Btn>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-brand" />
            <p className="text-lg font-bold">Email codes (mail server)</p>
          </div>
          <p className="text-sm text-muted">
            {auth.smtp.ready ? <span className="font-semibold text-[#4ade80]">Ready</span> : <span className="font-semibold text-amber-300">Not set up — fill in your SMTP details, save, then send a test.</span>}
            {auth.smtp.lastTestedAt && (auth.smtp.lastTestError ? <span className="block text-[#ff8a9a]">Last test failed: {auth.smtp.lastTestError}</span> : <span className="block text-[#4ade80]">Last test worked</span>)}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="SMTP host" value={smtp.host} onChange={(e) => setSmtp((s) => ({ ...s, host: e.target.value }))} placeholder="smtp.gmail.com" />
            <TextInput label="Port" type="number" value={smtp.port} onChange={(e) => setSmtp((s) => ({ ...s, port: e.target.value }))} hint="587 (STARTTLS) or 465 (SSL)" />
            <TextInput label="Username" value={smtp.user} onChange={(e) => setSmtp((s) => ({ ...s, user: e.target.value }))} autoComplete="off" />
            <TextInput label="Password" type="password" value={smtp.pass} onChange={(e) => setSmtp((s) => ({ ...s, pass: e.target.value }))} placeholder={auth.smtp.hasPass ? "Saved — leave empty to keep" : ""} autoComplete="new-password" />
            <div className="sm:col-span-2">
              <TextInput label="From" value={smtp.from} onChange={(e) => setSmtp((s) => ({ ...s, from: e.target.value }))} placeholder="PipraTube <no-reply@pipratube.com>" />
            </div>
          </div>
          <Toggle on={smtp.secure} onChange={(v) => setSmtp((s) => ({ ...s, secure: v }))} label="SSL (port 465)" />
          <Btn tone="primary" disabled={busy === "smtp"} onClick={() => run("smtp", () => send("put", `${API}/smtp`, smtp), "Mail server saved")}>
            <Save className="h-4 w-4" /> Save mail server
          </Btn>
          <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <div className="min-w-48 flex-1">
              <TextInput label="Send a test email to" value={testTo.email} onChange={(e) => setTestTo((t) => ({ ...t, email: e.target.value }))} placeholder="you@example.com" />
            </div>
            <Btn disabled={!auth.smtp.ready || !testTo.email || busy === "test-email"} onClick={() => run("test-email", () => send("post", `${API}/test`, { channel: "email", to: testTo.email }), "Test email sent")}>
              <Send className="h-4 w-4" /> Send test email
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SignupSettings;
