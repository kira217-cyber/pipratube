import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Logo, Spinner } from "../components/ui/ui";
import { apiError, studioApi } from "../api/studioApi";
import { useAuth } from "../context/AuthContext";

// Landing page for "Studio" links on pipratube.com: trades the one-time
// code for a Studio session, then continues to the page that was asked for.
const Handoff = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { saveSession } = useAuth();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the code works once — never send it twice
    started.current = true;
    const next = params.get("next") || "/";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    studioApi
      .post("/api/auth/handoff/redeem", { code: params.get("code") || "" })
      .then(({ data }) => {
        saveSession(data.data);
        navigate(safeNext, { replace: true });
      })
      .catch((err) => setError(apiError(err, "This sign-in link didn't work.")));
  }, [params, navigate, saveSession]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-page px-6 text-center text-white">
      <Logo className="h-12" />
      {error ? (
        <>
          <p className="max-w-sm text-sm text-muted">{error}</p>
          <Link to="/login" className="bg-brand-gradient rounded-xl px-6 py-2.5 text-sm font-semibold">
            Sign in to Studio
          </Link>
        </>
      ) : (
        <>
          <Spinner className="py-0" />
          <p className="text-sm text-muted">Opening PipraTube Studio…</p>
        </>
      )}
    </div>
  );
};

export default Handoff;
