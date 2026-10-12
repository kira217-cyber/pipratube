import mongoose from "mongoose";

// Admin-panel accounts — completely separate from site users.
// "super" can do everything incl. managing other admins; "sub" only what
// `permissions` lists.
export const ADMIN_PERMISSIONS = [
  "dashboard",
  "videos",
  "users",
  "channels",
  "comments",
  "reports",
  "home",
  "ads",
  "live-tv",
  "settings",
];

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "Admin" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["super", "sub"], default: "sub" },
    permissions: { type: [{ type: String, enum: ADMIN_PERMISSIONS }], default: [] },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const Admin = mongoose.model("Admin", adminSchema);

export default Admin;
