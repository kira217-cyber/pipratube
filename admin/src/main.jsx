import React, { lazy, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";

import "./index.css";
import { AdminAuthProvider } from "./AdminAuth";
import Guard from "./Guard";
import AdminLayout from "./layout/AdminLayout";
import Login from "./pages/Login";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Videos = lazy(() => import("./pages/Videos"));
const UploadVideo = lazy(() => import("./pages/UploadVideo"));
const Users = lazy(() => import("./pages/Users"));
const Channels = lazy(() => import("./pages/Channels"));
const Comments = lazy(() => import("./pages/Comments"));
const Reports = lazy(() => import("./pages/Reports"));
const Moderation = lazy(() => import("./pages/Moderation"));
const HomeCuration = lazy(() => import("./pages/HomeCuration"));
const Ads = lazy(() => import("./pages/Ads"));
const LiveTv = lazy(() => import("./pages/LiveTv"));
const LiveTvOverlays = lazy(() => import("./pages/LiveTvOverlays"));
const PipraChannel = lazy(() => import("./pages/PipraChannel"));
const LiveAnalytics = lazy(() => import("./pages/LiveAnalytics"));
const Settings = lazy(() => import("./pages/Settings"));
const SignupSettings = lazy(() => import("./pages/SignupSettings"));
const Admins = lazy(() => import("./pages/Admins"));
const Account = lazy(() => import("./pages/Account"));

const page = (perm, element) => <Guard perm={perm}>{element}</Guard>;

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: page(undefined, <AdminLayout />),
    children: [
      { index: true, element: page("dashboard", <Dashboard />) },
      { path: "videos", element: page("videos", <Videos />) },
      { path: "videos/upload", element: page("videos", <UploadVideo />) },
      { path: "users", element: page("users", <Users />) },
      { path: "channels", element: page("channels", <Channels />) },
      { path: "comments", element: page("comments", <Comments />) },
      { path: "reports", element: page("videos", <Reports />) },
      { path: "review-queue", element: page("videos", <Moderation />) },
      { path: "home", element: page("home", <HomeCuration />) },
      { path: "ads", element: page("ads", <Ads />) },
      { path: "live-tv", element: page("live-tv", <LiveTv />) },
      { path: "live-tv/pipra", element: page("live-tv", <PipraChannel />) },
      { path: "live-tv/overlays", element: page("live-tv", <LiveTvOverlays />) },
      { path: "analytics", element: page("dashboard", <LiveAnalytics />) },
      { path: "settings", element: page("settings", <Settings />) },
      { path: "signup", element: page("settings", <SignupSettings />) },
      { path: "admins", element: page("__super", <Admins />) },
      { path: "account", element: page(undefined, <Account />) },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AdminAuthProvider>
      <RouterProvider router={router} />
    </AdminAuthProvider>
  </StrictMode>,
);
