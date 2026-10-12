import React, { useState } from "react";

import { Card, PageHeader } from "../components/ui";
import { Btn, PasswordInput } from "../components/kit";
import { apiError, send, TOKEN_KEY } from "../api/client";
import { useAdmin } from "../AdminAuth";
import { toast } from "../utils/alerts";

const Account = () => {
  const { admin } = useAdmin();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [busy, setBusy] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await send("post", "/api/admin/me/password", form);
      localStorage.setItem(TOKEN_KEY, data.token);
      setForm({ currentPassword: "", newPassword: "" });
      toast.success("Password changed — other sessions were signed out");
    } catch (error) {
      toast.error(apiError(error, "Couldn't change password"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-lg">
      <PageHeader title="Account" subtitle={`${admin?.email} · ${admin?.role === "super" ? "Main admin" : "Admin"}`} />
      <Card className="p-4">
        <form onSubmit={save} className="space-y-3">
          <p className="font-semibold">Change password</p>
          <PasswordInput label="Current password" placeholder="Your current password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" />
          <PasswordInput label="New password (8+ characters)" placeholder="At least 8 characters" required minLength={8} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" />
          <Btn tone="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Change password"}
          </Btn>
        </form>
      </Card>
    </div>
  );
};

export default Account;
