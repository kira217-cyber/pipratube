// Creates the first (super) admin from ADMIN_EMAIL / ADMIN_PASSWORD in .env.
// Safe to re-run: an existing admin with that email is left alone.
import "../config/env.js";

import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import Admin from "../models/Admin.js";

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";

if (!email || password.length < 8) {
  console.error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 8 characters in .env first.");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);

const existing = await Admin.findOne({ email });
if (existing) {
  console.log(`Admin ${email} already exists — nothing changed.`);
} else {
  await Admin.create({ name: "Super Admin", email, password: await bcrypt.hash(password, 10), role: "super" });
  console.log(`Super admin ${email} created.`);
}

await mongoose.disconnect();
