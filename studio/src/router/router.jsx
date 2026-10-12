import React, { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router";

import StudioLayout from "../layout/StudioLayout";
import RequireAuth from "./RequireAuth";

const Dashboard = lazy(() => import("../pages/Dashboard"));
const MyVideos = lazy(() => import("../pages/MyVideos"));
const VideoEditor = lazy(() => import("../pages/VideoEditor"));
const Analytics = lazy(() => import("../pages/Analytics"));
const Earning = lazy(() => import("../pages/Earning"));
const VerifyIdentity = lazy(() => import("../pages/VerifyIdentity"));
const Profile = lazy(() => import("../pages/Profile"));
const ComingSoon = lazy(() => import("../pages/ComingSoon"));
const CreateChannel = lazy(() => import("../pages/CreateChannel"));
const CustomizeChannel = lazy(() => import("../pages/CustomizeChannel"));
const Login = lazy(() => import("../pages/Login"));
const Handoff = lazy(() => import("../pages/Handoff"));

const creator = (page) => <RequireAuth channel>{page}</RequireAuth>;
const signedIn = (page) => <RequireAuth>{page}</RequireAuth>;

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  // Arriving from pipratube.com with a one-time sign-in code.
  { path: "/sso", element: <Handoff /> },
  {
    path: "/",
    element: <StudioLayout />,
    children: [
      { index: true, element: creator(<Dashboard />) },
      { path: "videos", element: creator(<MyVideos />) },
      { path: "upload", element: creator(<VideoEditor mode="create" />) },
      { path: "videos/:id/edit", element: creator(<VideoEditor mode="edit" />) },
      { path: "customize", element: creator(<CustomizeChannel />) },
      { path: "analytics", element: creator(<Analytics />) },
      { path: "earning", element: creator(<Earning />) },
      { path: "verify", element: signedIn(<VerifyIdentity />) },
      { path: "profile", element: signedIn(<Profile />) },
      { path: "channel/create", element: signedIn(<CreateChannel />) },
      {
        path: "payout",
        element: creator(<ComingSoon title="Payout information" text="Add bKash, Nagad or a bank account to receive your earnings. This is coming soon." />),
      },
      {
        path: "billing",
        element: creator(<ComingSoon title="Billing & payment" text="Invoices and payment history will appear here once monetization goes live." />),
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
