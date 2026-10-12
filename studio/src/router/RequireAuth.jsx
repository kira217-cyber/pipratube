import React from "react";
import { Navigate, useLocation } from "react-router";

import { useAuth } from "../context/AuthContext";
import { Spinner } from "../components/ui/ui";

// Every Studio page needs a signed-in account; most also need the account's
// channel (upload, content, analytics…) — without one, the creator is sent
// to set it up first, like YouTube Studio does.
const RequireAuth = ({ children, channel: needsChannel = false }) => {
  const { user, channel, checking } = useAuth();
  const location = useLocation();

  if (checking && !user) return <Spinner className="min-h-[60vh]" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (needsChannel && !channel) return <Navigate to="/channel/create" replace state={{ from: location.pathname }} />;
  return children;
};

export default RequireAuth;
