import React, { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { KeyRound, Lock, Mail, Phone, UserRound } from "lucide-react";

import AuthShell from "./AuthShell";
import { Field, PasswordInput, PrimaryButton, inputClass } from "../../components/ui/ui";
import { useAuth } from "../../context/AuthContext";
import { apiError, studioApi } from "../../api/studioApi";
import { toast } from "../../utils/alerts";

// Sign up with a phone number or an email — whichever the admin has turned
// on (GET /api/auth/options). When the admin asks for it, the number /
// address is confirmed with a code (OTP) before the account is made.
const METHODS = [
  ["phone", "Phone", Phone],
  ["email", "Email", Mail],
];

const Register = () => {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [options, setOptions] = useState(null);
  const [method, setMethod] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", otp: "" });
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState("");
  const [wait, setWait] = useState(0);

  const target = location.state?.from || "/";

  useEffect(() => {
    studioApi
      .get("/api/auth/options")
      .then(({ data }) => {
        const opts = data.data;
        setOptions(opts);
        setMethod(METHODS.map(([key]) => key).find((key) => opts[key]?.register) || null);
      })
      .catch(() => setOptions({ registrationOpen: false, phone: {}, email: {} }));
  }, []);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  if (user) return <Navigate to={target} replace />;

  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));
  const available = options ? METHODS.filter(([key]) => options[key]?.register) : [];
  const needsCode = Boolean(method && options?.[method]?.otp);
  const contact = method === "phone" ? form.phone.trim() : form.email.trim().toLowerCase();
  const codeSent = needsCode && codeSentTo && codeSentTo === `${method}:${contact}`;

  const sendCode = async () => {
    if (!contact) {
      toast.error(method === "phone" ? "Enter your mobile number first" : "Enter your email first");
      return;
    }
    setSending(true);
    try {
      await studioApi.post("/api/auth/otp/send", { method, target: contact });
      setCodeSentTo(`${method}:${contact}`);
      setWait(60);
      toast.success(method === "phone" ? "Code sent by SMS" : "Code sent to your email");
    } catch (error) {
      toast.error(apiError(error, "Couldn't send the code"));
    } finally {
      setSending(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (needsCode && !codeSent) {
      await sendCode();
      return;
    }
    setBusy(true);
    try {
      await register({
        method,
        name: form.name.trim(),
        ...(method === "email" ? { email: contact } : { phone: contact }),
        password: form.password,
        ...(needsCode ? { otp: form.otp.trim() } : {}),
      });
      toast.success("Welcome to PipraTube!");
      navigate(target, { replace: true });
    } catch (error) {
      toast.error(apiError(error, "Sign up failed"));
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <>
      Already have an account?{" "}
      <Link to="/login" state={location.state} className="font-semibold text-brand hover:underline">
        Sign in
      </Link>
    </>
  );

  if (!options) {
    return (
      <AuthShell title="Create your account" subtitle="Watch, like, comment and start your own channel" footer={footer}>
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      </AuthShell>
    );
  }

  if (!available.length) {
    return (
      <AuthShell title="Sign-ups are paused" subtitle="New accounts can't be made right now" footer={footer}>
        <p className="py-6 text-center text-sm leading-relaxed text-slate-300">We've paused new sign-ups for a little while. Please try again later — if you already have an account, sign in.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Watch, like, comment and start your own channel" footer={footer}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name" icon={UserRound} required>
          <input required value={form.name} onChange={set("name")} placeholder="e.g. Rahim Uddin" className={inputClass} autoComplete="name" />
        </Field>

        {available.length > 1 && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-card-2 p-1 text-sm font-medium">
            {available.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMethod(key)}
                className={`cursor-pointer rounded-lg py-2 transition ${method === key ? "bg-brand text-white" : "text-slate-300"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {method === "email" ? (
          <Field label="Email" icon={Mail} required>
            <input required type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" className={inputClass} autoComplete="email" />
          </Field>
        ) : (
          <Field label="Mobile number" icon={Phone} required>
            <input required type="tel" value={form.phone} onChange={set("phone")} placeholder="01XXXXXXXXX" className={inputClass} autoComplete="tel" />
          </Field>
        )}

        <Field label="Password" icon={Lock} required>
          <PasswordInput required value={form.password} onChange={set("password")} placeholder="At least 6 characters" autoComplete="new-password" />
        </Field>

        {needsCode && codeSent && (
          <Field label={method === "phone" ? "Code from the SMS" : "Code from the email"} icon={KeyRound} required>
            <div className="flex gap-2">
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={form.otp}
                onChange={set("otp")}
                placeholder="6-digit code"
                className={`${inputClass} tracking-widest`}
              />
              <button
                type="button"
                onClick={sendCode}
                disabled={wait > 0 || sending}
                className="shrink-0 cursor-pointer rounded-xl border border-white/15 px-3 text-sm font-semibold disabled:cursor-default disabled:opacity-50"
              >
                {wait > 0 ? `Resend ${wait}s` : "Resend"}
              </button>
            </div>
          </Field>
        )}

        <PrimaryButton type="submit" disabled={busy || sending} className="w-full">
          {busy ? "Creating account..." : sending ? "Sending code..." : needsCode && !codeSent ? "Send code" : "Create account"}
        </PrimaryButton>
        {needsCode && !codeSent && (
          <p className="text-center text-xs text-muted">
            We'll send a code to your {method === "phone" ? "phone by SMS" : "email"} to confirm it's you.
          </p>
        )}
      </form>
    </AuthShell>
  );
};

export default Register;
