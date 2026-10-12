import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Avatar, Card, PageHeader, Spinner } from "../components/ui";
import { Badge, Btn, Modal, PasswordInput, TextInput, Toggle } from "../components/kit";
import { apiError, get, send } from "../api/client";
import { timeAgo } from "../utils/format";
import { toast, confirmDialog } from "../utils/alerts";

const LABELS = {
  dashboard: "Dashboard",
  videos: "Videos",
  users: "Users",
  channels: "Channels",
  comments: "Comments",
  reports: "Reports",
  home: "Home page",
  ads: "Ads",
  "live-tv": "Live TV",
  settings: "Site settings",
};

const Permissions = ({ all, value, onChange }) => (
  <div className="grid grid-cols-2 gap-2">
    {all.map((p) => (
      <Toggle key={p} on={value.includes(p)} onChange={(on) => onChange(on ? [...value, p] : value.filter((x) => x !== p))} label={LABELS[p] || p} />
    ))}
  </div>
);

const AdminForm = ({ admin, all, onClose, onSaved }) => {
  const [form, setForm] = useState({ name: admin?.name || "", email: admin?.email || "", password: "", permissions: admin?.permissions || ["dashboard"] });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const data = admin
        ? await send("patch", `/api/admin/admins/${admin.id}`, { name: form.name, permissions: form.permissions, ...(form.password ? { password: form.password } : {}) })
        : await send("post", "/api/admin/admins", form);
      toast.success(admin ? "Admin saved" : "Admin created");
      onSaved(data.admin);
    } catch (error) {
      toast.error(apiError(error, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={admin ? `Edit ${admin.name}` : "New admin"}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="primary" onClick={save} disabled={busy}>
            Save
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <TextInput label="Name" placeholder="e.g. Rahim Uddin" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        {!admin && <TextInput label="Email" type="email" placeholder="name@pipratv.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        <PasswordInput label={admin ? "New password (leave empty to keep)" : "Password (8+ characters)"} placeholder="At least 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <p className="pt-2 text-sm text-muted">What this admin can manage</p>
        <Permissions all={all} value={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} />
      </div>
    </Modal>
  );
};

const Admins = () => {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = () => get("/api/admin/admins").then(setData).catch(() => setData({ admins: [], permissions: [] }));

  useEffect(() => {
    load();
  }, []);

  if (!data) return <Spinner className="min-h-[50vh]" />;

  const setStatus = async (admin, active) => {
    try {
      await send("patch", `/api/admin/admins/${admin.id}`, { status: active ? "active" : "disabled" });
      load();
    } catch (error) {
      toast.error(apiError(error, "Couldn't update"));
    }
  };

  const remove = async (admin) => {
    if (!(await confirmDialog(`Delete ${admin.name}?`))) return;
    await send("delete", `/api/admin/admins/${admin.id}`).catch((e) => toast.error(apiError(e)));
    load();
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title="Admins" subtitle="People who can open this panel">
        <Btn tone="primary" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New admin
        </Btn>
      </PageHeader>
      <div className="space-y-3">
        {data.admins.map((a) => (
          <Card key={a.id} className="flex flex-wrap items-center gap-3 p-3">
            <Avatar name={a.name} size="h-10 w-10" ring={false} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold">
                {a.name} {a.role === "super" ? <Badge tone="purple">Main admin</Badge> : a.status === "disabled" && <Badge tone="red">Disabled</Badge>}
              </p>
              <p className="truncate text-xs text-muted">
                {a.email} · {a.lastLoginAt ? `last sign-in ${timeAgo(a.lastLoginAt)}` : "never signed in"}
              </p>
              {a.role !== "super" && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.permissions.length ? a.permissions.map((p) => <Badge key={p}>{LABELS[p] || p}</Badge>) : <Badge tone="amber">No access</Badge>}
                </div>
              )}
            </div>
            {a.role !== "super" && (
              <>
                <Toggle on={a.status !== "disabled"} onChange={(on) => setStatus(a, on)} label="Active" />
                <Btn onClick={() => setEditing(a)}>Edit</Btn>
                <Btn tone="plain" onClick={() => remove(a)} aria-label="Delete admin">
                  <Trash2 className="h-4 w-4" />
                </Btn>
              </>
            )}
          </Card>
        ))}
      </div>
      {editing && (
        <AdminForm
          admin={editing === "new" ? null : editing}
          all={data.permissions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
};

export default Admins;
