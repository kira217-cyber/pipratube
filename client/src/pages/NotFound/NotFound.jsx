import React from "react";
import { Link } from "react-router";

import { Logo } from "../../components/ui/ui";

const NotFound = () => (
  <div className="flex min-h-[70vh] flex-col items-center justify-center bg-page px-6 text-center text-white">
    <Logo className="h-12" />
    <p className="mt-8 text-6xl font-black text-brand">404</p>
    <p className="mt-2 text-lg font-semibold">This page doesn't exist</p>
    <Link to="/" className="bg-brand-gradient mt-6 rounded-full px-6 py-3 font-semibold">
      Go to Home
    </Link>
  </div>
);

export default NotFound;
