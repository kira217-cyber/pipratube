import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";

import { Card, Field, Logo, PrimaryButton, inputClass } from "../components/ui";
import { useAdmin } from "../AdminAuth";
import { apiError } from "../api/client";
import { toast } from "../utils/alerts";

const Login = () => {
  const { admin, login } = useAdmin();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  if (admin) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(apiError(error, "Sign in failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 text-white">
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <div className="flex flex-col items-center">
          <Logo className="h-12" />
          <span className="mt-2 rounded-md bg-brand/20 px-2 py-0.5 text-xs font-bold text-brand">ADMIN PANEL</span>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Email" icon={Mail} required>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="admin@example.com" autoFocus className={inputClass} />
          </Field>
          <Field label="Password" icon={Lock} required>
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Enter your password"
              className={inputClass}
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowPassword((v) => !v);
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              className="-mr-1 shrink-0 cursor-pointer rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-white"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </Field>
          <PrimaryButton type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
};

export default Login;
