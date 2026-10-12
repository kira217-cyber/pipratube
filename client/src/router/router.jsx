import React, { lazy } from "react";
import { createBrowserRouter } from "react-router";

import AppLayout from "../layout/AppLayout";
import RequireAuth from "./RequireAuth";

import Home from "../pages/Home/Home";
import Videos from "../pages/Videos/Videos";
import WatchVideo from "../pages/WatchVideo/WatchVideo";
const Shorts = lazy(() => import("../pages/Shorts/Shorts"));
import LiveTv from "../pages/LiveTv/LiveTv";
import LiveTvCategory from "../pages/LiveTv/LiveTvCategory";
import LiveTvWatch from "../pages/LiveTv/LiveTvWatch";
const Channel = lazy(() => import("../pages/Channel/Channel"));
const Channels = lazy(() => import("../pages/Channels/Channels"));
const Search = lazy(() => import("../pages/Search/Search"));
const Login = lazy(() => import("../pages/Auth/Login"));
const Register = lazy(() => import("../pages/Auth/Register"));
const Handoff = lazy(() => import("../pages/Auth/Handoff"));
import NotFound from "../pages/NotFound/NotFound";

const libraryPage = (name) => lazy(() => import("../pages/Library/Library").then((module) => ({ default: module[name] })));
const You = libraryPage("You");
const SubscriptionsFeed = libraryPage("SubscriptionsFeed");
const History = libraryPage("History");
const Liked = libraryPage("Liked");
const PlaylistPage = libraryPage("PlaylistPage");
const ChannelByHandle = lazy(() => import("../pages/Channel/Channel").then((module) => ({ default: module.ChannelByHandle })));

// Pages that need a signed-in viewer.
const signedIn = (element) => <RequireAuth>{element}</RequireAuth>;

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Home /> },
      { path: "videos", element: <Videos /> },
      { path: "watch/:id", element: <WatchVideo /> },
      { path: "shorts", element: <Shorts /> },
      { path: "live-tv", element: <LiveTv /> },
      { path: "live-tv/category/:key", element: <LiveTvCategory /> },
      { path: "live-tv/:id", element: <LiveTvWatch /> },
      { path: "channel/:id", element: <Channel /> },
      { path: "channels", element: <Channels /> },
      { path: "search", element: <Search /> },
      { path: "login", element: <Login /> },
      { path: "register", element: <Register /> },
      // Arriving from PipraTube Studio with a one-time sign-in code.
      { path: "sso", element: <Handoff /> },
      { path: "you", element: signedIn(<You />) },
      { path: "feed/subscriptions", element: signedIn(<SubscriptionsFeed />) },
      { path: "feed/history", element: signedIn(<History />) },
      { path: "feed/liked", element: signedIn(<Liked />) },
      { path: "playlist/:id", element: <PlaylistPage /> },

      // YouTube-style channel address: /@handle
      { path: ":at", element: <ChannelByHandle /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
