import React from "react";
import { Navigate } from "react-router";

import { useAdmin } from "./AdminAuth";
import { Spinner } from "./components/ui";

// Signed in, and allowed to open this page ("__super" = main admin only).
const Guard = ({ perm, children }) => {
  const { admin, checking, can } = useAdmin();
  if (checking && !admin) return <Spinner className="min-h-screen" />;
  if (!admin) return <Navigate to="/login" replace />;
  if (perm === "__super" ? admin.role !== "super" : !can(perm)) {
    return <p className="py-20 text-center text-muted">You don't have permission to open this page.</p>;
  }
  return children;
};

export default Guard;
