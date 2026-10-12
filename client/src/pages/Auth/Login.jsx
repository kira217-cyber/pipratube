import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { Eye, EyeOff, Lock, UserRound } from "lucide-react";

import AuthShell from "./AuthShell";
import { Field, PrimaryButton, inputClass } from "../../components/ui/ui";
import { useAuth } from "../../context/AuthContext";
import { apiError } from "../../api/studioApi";
import { toast } from "../../utils/alerts";

const Login = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const target = location.state?.from || "/";

  if (user) return <Navigate to={target} replace />;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const session = await login({ identifier: identifier.trim(), password });
      toast.success(`Welcome back, ${session.user.name.split(" ")[0]}!`);
      navigate(target, { replace: true });
    } catch (error) {
      toast.error(apiError(error, "Sign in failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="to continue to PipraTube"
      footer={
        <>
          New to PipraTube?{" "}
          <Link to="/register" state={location.state} className="font-semibold text-brand hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
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
          <input
            required
            type={show ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••"
            autoComplete="current-password"
            className={inputClass}
          />
          <button type="button" onClick={() => setShow((value) => !value)} className="cursor-pointer text-muted" aria-label="Show password">
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </Field>
        <PrimaryButton type="submit" disabled={busy} className="w-full">
          {busy ? "Signing in..." : "Sign in"}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
};

export default Login;
