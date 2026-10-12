import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

import { useAuth } from "../context/AuthContext";
import { toast } from "../utils/alerts";

// For buttons that need an account (like, subscribe, comment, save):
// returns true when signed in, otherwise sends the viewer to sign in and
// brings them back here afterwards.
export const useRequireSignIn = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (reason = "Sign in to continue") => {
      if (user) return true;
      toast.info(reason);
      navigate("/login", { state: { from: `${location.pathname}${location.search}` } });
      return false;
    },
    [user, navigate, location.pathname, location.search],
  );
};

export default useRequireSignIn;
