import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Lock, UserRound } from "lucide-react";

import { Card, Field, Logo, PasswordInput, PrimaryButton, inputClass } from "../components/ui/ui";
import { apiError } from "../api/studioApi";
import { SITE_URL } from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { toast } from "../utils/alerts";

// Studio sign-in — the same PipraTube account as the viewer site.
const Login = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const from = location.state?.from || "/";

  if (user) return <Navigate to={from} replace />;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await login({ identifier: identifier.trim(), password });
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(apiError(error, "Sign in failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-10 text-white">
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Logo className="h-12" />
          <span className="mt-2 rounded-md bg-brand/20 px-2 py-0.5 text-xs font-bold tracking-wide text-brand">STUDIO</span>
          <h1 className="mt-4 text-xl font-bold">Sign in to PipraTube Studio</h1>
          <p className="mt-1 text-sm text-muted">Use the same account as PipraTube</p>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Email or phone" icon={UserRound} required>
            <input
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="you@example.com or 01XXXXXXXXX"
              autoComplete="username"
              className={inputClass}
            />
          </Field>
          <Field label="Password" icon={Lock} required>
            <PasswordInput required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" autoComplete="current-password" />
          </Field>
          <PrimaryButton type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </PrimaryButton>
        </form>
        <p className="mt-5 text-center text-sm text-muted">
          New to PipraTube?{" "}
          <a href={`${SITE_URL}/register`} className="font-semibold text-brand hover:underline">
            Create an account
          </a>
        </p>
      </Card>
    </div>
  );
};

export default Login;
