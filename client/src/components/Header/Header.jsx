import React, { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Bell, CloudUpload, Menu, Search } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import Notifications from "./Notifications";
import { Avatar, Logo } from "../ui/ui";
import StudioLink from "../StudioLink/StudioLink";
import SearchBox from "./SearchBox";

const Header = ({ onMenu }) => {
  const { user, channel } = useAuth();
  const [mobileSearch, setMobileSearch] = useState(false);

  if (mobileSearch) {
    return (
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-2 border-b border-line bg-header px-3 lg:hidden">
        <button
          type="button"
          aria-label="Close search"
          onClick={() => setMobileSearch(false)}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-white hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <SearchBox autoFocus onDone={() => setMobileSearch(false)} />
      </header>
    );
  }

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-1 border-b border-line bg-header/95 px-2 backdrop-blur min-[380px]:gap-2 sm:px-4 lg:gap-4 lg:px-6">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onMenu}
        className="flex h-10 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white hover:bg-white/10 min-[380px]:w-10"
      >
        <Menu className="h-7 w-7" />
      </button>

      <Link to="/" className="min-w-0 shrink">
        <Logo className="h-10 max-w-full min-[380px]:h-12 sm:h-[52px]" />
      </Link>

      <div className="mx-auto hidden w-full max-w-2xl lg:block">
        <SearchBox />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-0.5 min-[380px]:gap-1 sm:gap-2 lg:ml-0">
        <button
          type="button"
          aria-label="Search"
          onClick={() => setMobileSearch(true)}
          className="flex h-10 w-9 cursor-pointer items-center justify-center rounded-full text-white hover:bg-white/10 min-[380px]:w-10 lg:hidden"
        >
          <Search className="h-6 w-6" />
        </button>

        <Notifications />

        <Link
          to="/live-tv"
          className="ml-1 flex items-center gap-1.5 rounded-full bg-live px-3 py-2 text-sm font-bold tracking-wide text-white shadow-[0_0_16px_rgba(227,23,47,0.55)] transition hover:brightness-110 min-[380px]:px-4 sm:text-base"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
          LIVE
        </Link>

        <StudioLink
          to="/upload"
          className="bg-upload-gradient ml-1 hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white lg:flex"
        >
          <CloudUpload className="h-5 w-5" />
          Upload
        </StudioLink>

        {user ? (
          <StudioLink to={channel ? "/" : "/profile"} className="ml-1 hidden lg:block" aria-label="Your account">
            <Avatar src={channel?.avatar || user.avatar} name={channel?.name || user.name} size="h-9 w-9" />
          </StudioLink>
        ) : (
          <Link
            to="/login"
            className="ml-1 hidden rounded-full border border-line px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 lg:block"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
};

export default Header;
