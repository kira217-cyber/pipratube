import jwt from "jsonwebtoken";

import User from "../models/User.js";
import Admin from "../models/Admin.js";
import { errorResponse } from "../utils/response.js";

export const signUserToken = (user) =>
  jwt.sign({ id: user._id, v: user.tokenVersion || 0, kind: "user" }, process.env.JWT_SECRET, { expiresIn: "30d" });

export const signAdminToken = (admin) =>
  jwt.sign({ id: admin._id, v: admin.tokenVersion || 0, kind: "admin" }, process.env.ADMIN_JWT_SECRET, {
    expiresIn: "7d",
  });

const bearer = (req) => {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
};

const loadUser = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.kind !== "user") return null;
  const user = await User.findById(decoded.id);
  if (!user || decoded.v !== (user.tokenVersion || 0)) return null;
  return user;
};

// Signed-in site user required.
export const requireUser = async (req, res, next) => {
  const token = bearer(req);
  if (!token) return errorResponse(res, "Please sign in", 401);

  try {
    const user = await loadUser(token);
    if (!user) return errorResponse(res, "Session expired, please sign in again", 401);
    if (user.status === "blocked") return errorResponse(res, "This account has been blocked", 403);
    req.user = user;
    next();
  } catch {
    return errorResponse(res, "Session expired, please sign in again", 401);
  }
};

// Signed-in user if there is one (e.g. to mark "you liked this"), else anonymous.
export const optionalUser = async (req, res, next) => {
  const token = bearer(req);
  if (token) {
    try {
      const user = await loadUser(token);
      if (user && user.status === "active") req.user = user;
    } catch {
      // Bad/expired token on a public route — just treat as signed out.
    }
  }
  next();
};

// Admin panel. Pass a permission key to require it (super admins have all).
export const requireAdmin = (permission) => async (req, res, next) => {
  const token = bearer(req);
  if (!token) return errorResponse(res, "Admin sign-in required", 401);

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (decoded.kind !== "admin") return errorResponse(res, "Admin sign-in required", 401);
    const admin = await Admin.findById(decoded.id);
    if (!admin || decoded.v !== (admin.tokenVersion || 0) || admin.status !== "active") {
      return errorResponse(res, "Session expired, please sign in again", 401);
    }
    if (permission && admin.role !== "super" && !admin.permissions.includes(permission)) {
      return errorResponse(res, "You don't have permission for this", 403);
    }
    req.admin = admin;
    next();
  } catch {
    return errorResponse(res, "Session expired, please sign in again", 401);
  }
};

// Video uploads: a signed-in site user (Studio) or an admin with the videos
// permission (admin panel). Sets req.uploader = "user:<id>" | "admin:<id>".
export const requireUploader = async (req, res, next) => {
  const token = bearer(req);
  if (!token) return errorResponse(res, "Please sign in", 401);
  try {
    const user = await loadUser(token);
    if (user && user.status === "active") {
      req.user = user;
      req.uploader = `user:${user._id}`;
      return next();
    }
  } catch {
    // Not a site token — maybe an admin one.
  }
  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    const admin = decoded.kind === "admin" ? await Admin.findById(decoded.id) : null;
    if (admin && decoded.v === (admin.tokenVersion || 0) && admin.status === "active" && (admin.role === "super" || admin.permissions.includes("videos"))) {
      req.admin = admin;
      req.uploader = `admin:${admin._id}`;
      return next();
    }
  } catch {
    // Neither.
  }
  return errorResponse(res, "Session expired, please sign in again", 401);
};
