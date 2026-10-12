import React, { useState } from "react";
import { Ban, CheckCircle2 } from "lucide-react";

import { Avatar, EmptyState, PageHeader, Spinner } from "../components/ui";
import { Badge, Btn, Pager, SearchInput, Select } from "../components/kit";
import { apiError, send, SITE_URL } from "../api/client";
import { usePaged } from "../hooks/usePaged";
import { fullDate, timeAgo } from "../utils/format";
import { toast, confirmDialog } from "../utils/alerts";

const Users = () => {
  const [status, setStatus] = useState("");
  const list = usePaged("/api/admin/users", { status: status || undefined });

  const setUserStatus = async (user, next) => {
    if (next === "blocked" && !(await confirmDialog(`Block ${user.name}? They are signed out everywhere and can't sign in.`))) return;
    try {
      await send("patch", `/api/admin/users/${user.id}`, { status: next });
      list.update(user.id, { status: next });
      toast.success(next === "blocked" ? "User blocked" : "User unblocked");
    } catch (error) {
      toast.error(apiError(error, "Couldn't update"));
    }
  };

  return (
    <div>
      <PageHeader title="Users" subtitle={`${list.total} accounts`} />
      <div className="flex flex-wrap gap-2">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Name, email or phone" />
        <Select value={status} onChange={setStatus} options={[["", "Everyone"], ["active", "Active"], ["blocked", "Blocked"]]} />
      </div>
      <div className="mt-4">
        {list.loading ? (
          <Spinner />
        ) : list.items.length === 0 ? (
          <EmptyState title="No users found" />
        ) : (
          <div className="divide-y divide-line rounded-2xl border border-line bg-card">
            {list.items.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                <Avatar src={u.avatar} name={u.name} size="h-10 w-10" ring={false} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {u.name} {u.status === "blocked" && <Badge tone="red">Blocked</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {[u.email, u.phone].filter(Boolean).join(" · ")} · joined {fullDate(u.createdAt)}
                    {u.lastLoginAt ? ` · last seen ${timeAgo(u.lastLoginAt)}` : ""}
                  </p>
                  {u.channel && (
                    <a href={`${SITE_URL}/@${u.channel.handle}`} target="_blank" rel="noreferrer" className="text-xs text-[#3ea6ff] hover:underline">
                      Channel: {u.channel.name} (@{u.channel.handle})
                    </a>
                  )}
                </div>
                {u.status === "blocked" ? (
                  <Btn onClick={() => setUserStatus(u, "active")}>
                    <CheckCircle2 className="h-4 w-4" /> Unblock
                  </Btn>
                ) : (
                  <Btn tone="danger" onClick={() => setUserStatus(u, "blocked")}>
                    <Ban className="h-4 w-4" /> Block
                  </Btn>
                )}
              </div>
            ))}
          </div>
        )}
        <Pager page={list.page} totalPages={list.totalPages} onPage={list.setPage} />
      </div>
    </div>
  );
};

export default Users;
