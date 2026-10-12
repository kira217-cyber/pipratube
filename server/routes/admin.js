import express from "express";
import bcrypt from "bcryptjs";

import Admin, { ADMIN_PERMISSIONS } from "../models/Admin.js";
import { requireAdmin, signAdminToken } from "../middleware/auth.js";
import { successResponse, errorResponse } from "../utils/response.js";

// Admin panel API: sign-in, own account, and managing other admins.
// Content lives in adminContent.js, site setup in adminSite.js.
const router = express.Router();

const publicAdmin = (admin) => ({
  id: admin._id,
  name: admin.name,
  email: admin.email,
  role: admin.role,
  permissions: admin.permissions,
  lastLoginAt: admin.lastLoginAt,
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return errorResponse(res, "Enter email and password", 400);

    const admin = await Admin.findOne({ email: String(email).trim().toLowerCase() }).select("+password");
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return errorResponse(res, "Wrong email or password", 401);
    }
    if (admin.status !== "active") return errorResponse(res, "This admin account is disabled", 403);

    admin.lastLoginAt = new Date();
    await admin.save();

    return successResponse(res, "Signed in", { token: signAdminToken(admin), admin: publicAdmin(admin) });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.get("/me", requireAdmin(), (req, res) =>
  successResponse(res, "Admin", { admin: publicAdmin(req.admin), permissions: ADMIN_PERMISSIONS }),
);

router.post("/me/password", requireAdmin(), async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) return errorResponse(res, "New password must be at least 8 characters", 400);
  const admin = await Admin.findById(req.admin._id).select("+password");
  if (!(await bcrypt.compare(currentPassword || "", admin.password))) return errorResponse(res, "Current password is wrong", 400);
  admin.password = await bcrypt.hash(newPassword, 10);
  admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  await admin.save();
  return successResponse(res, "Password changed", { token: signAdminToken(admin) });
});

// ---- managing other admins (super admins only) ----

const superOnly = (req, res, next) =>
  req.admin.role === "super" ? next() : errorResponse(res, "Only the main admin can manage admins", 403);

const cleanPermissions = (list) => (Array.isArray(list) ? [...new Set(list.filter((p) => ADMIN_PERMISSIONS.includes(p)))] : []);

router.get("/admins", requireAdmin(), superOnly, async (req, res) => {
  const admins = await Admin.find().sort({ createdAt: 1 });
  return successResponse(res, "Admins", { admins: admins.map((a) => ({ ...publicAdmin(a), status: a.status, createdAt: a.createdAt })), permissions: ADMIN_PERMISSIONS });
});

router.post("/admins", requireAdmin(), superOnly, async (req, res) => {
  try {
    const { name, email, password, permissions } = req.body || {};
    if (!email || !password || password.length < 8) return errorResponse(res, "Email and a password of at least 8 characters are required", 400);
    const admin = await Admin.create({
      name: String(name || "Admin").trim().slice(0, 60),
      email: String(email).trim().toLowerCase(),
      password: await bcrypt.hash(password, 10),
      role: "sub",
      permissions: cleanPermissions(permissions),
    });
    return successResponse(res, "Admin created", { admin: publicAdmin(admin) }, 201);
  } catch (error) {
    if (error?.code === 11000) return errorResponse(res, "An admin with this email already exists", 409);
    return errorResponse(res, error.message, 500);
  }
});

router.patch("/admins/:id", requireAdmin(), superOnly, async (req, res) => {
  const admin = await Admin.findById(req.params.id).select("+password").catch(() => null);
  if (!admin) return errorResponse(res, "Admin not found", 404);
  if (admin.role === "super") return errorResponse(res, "The main admin can't be changed here", 400);
  const { name, permissions, status, password } = req.body || {};
  if (typeof name === "string" && name.trim()) admin.name = name.trim().slice(0, 60);
  if (permissions) admin.permissions = cleanPermissions(permissions);
  if (status === "active" || status === "disabled") {
    if (status !== admin.status) admin.tokenVersion += 1;
    admin.status = status;
  }
  if (password) {
    if (password.length < 8) return errorResponse(res, "Password must be at least 8 characters", 400);
    admin.password = await bcrypt.hash(password, 10);
    admin.tokenVersion += 1;
  }
  await admin.save();
  return successResponse(res, "Admin saved", { admin: { ...publicAdmin(admin), status: admin.status } });
});

router.delete("/admins/:id", requireAdmin(), superOnly, async (req, res) => {
  const admin = await Admin.findById(req.params.id).catch(() => null);
  if (!admin) return errorResponse(res, "Admin not found", 404);
  if (admin.role === "super") return errorResponse(res, "The main admin can't be deleted", 400);
  await admin.deleteOne();
  return successResponse(res, "Admin deleted");
});

export default router;
