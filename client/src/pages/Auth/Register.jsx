import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { Lock, Mail, Phone, UserRound } from "lucide-react";

import AuthShell from "./AuthShell";
import { Field, PasswordInput, PrimaryButton, inputClass } from "../../components/ui/ui";
import { useAuth } from "../../context/AuthContext";
import { apiError } from "../../api/studioApi";
import { toast } from "../../utils/alerts";

// Sign up with an email or a phone number (OTP verification comes later).
const Register = () => {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [method, setMethod] = useState("email");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);

  const target = location.state?.from || "/";

  if (user) return <Navigate to={target} replace />;

  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        ...(method === "email" ? { email: form.email.trim() } : { phone: form.phone.trim() }),
        password: form.password,
      });
      toast.success("Welcome to PipraTube!");
      navigate(target, { replace: true });
    } catch (error) {
      toast.error(apiError(error, "Sign up failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Watch, like, comment and start your own channel"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" state={location.state} className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name" icon={UserRound} required>
          <input required value={form.name} onChange={set("name")} placeholder="e.g. Rahim Uddin" className={inputClass} autoComplete="name" />
        </Field>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-card-2 p-1 text-sm font-medium">
          {[
            ["email", "Email"],
            ["phone", "Phone"],
          ].map(([key, label]) => (
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
        <PrimaryButton type="submit" disabled={busy} className="w-full">
          {busy ? "Creating account..." : "Create account"}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
};

export default Register;
