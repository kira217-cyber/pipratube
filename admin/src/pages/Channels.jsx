import React, { useState } from "react";
import { BadgeCheck, ExternalLink, PauseCircle, PlayCircle } from "lucide-react";

import { Avatar, EmptyState, PageHeader, Spinner } from "../components/ui";
import { Badge, Btn, Pager, SearchInput, Select, Toggle } from "../components/kit";
import { apiError, send, SITE_URL } from "../api/client";
import { usePaged } from "../hooks/usePaged";
import { formatCount, fullDate } from "../utils/format";
import { toast, confirmDialog } from "../utils/alerts";

const Channels = () => {
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const list = usePaged("/api/admin/channels", { status: status || undefined, sort });

  const save = async (channel, patch, message) => {
    try {
      await send("patch", `/api/admin/channels/${channel.id}`, patch);
      list.update(channel.id, patch);
      toast.success(message);
    } catch (error) {
      toast.error(apiError(error, "Couldn't update"));
    }
  };

  return (
    <div>
      <PageHeader title="Channels" subtitle={`${list.total} channels`} />
      <div className="flex flex-wrap gap-2">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Name or @handle" />
        <Select value={status} onChange={setStatus} options={[["", "Any status"], ["active", "Active"], ["suspended", "Suspended"]]} />
        <Select value={sort} onChange={setSort} options={[["newest", "Newest"], ["subscribers", "Most subscribers"], ["views", "Most views"]]} />
      </div>
      <div className="mt-4">
        {list.loading ? (
          <Spinner />
        ) : list.items.length === 0 ? (
          <EmptyState title="No channels yet" />
        ) : (
          <div className="divide-y divide-line rounded-2xl border border-line bg-card">
            {list.items.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                <Avatar src={c.avatar} name={c.name} size="h-11 w-11" ring={false} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                    {c.name}
                    {c.verified && <BadgeCheck className="h-4 w-4 fill-[#3ea6ff] text-card" />}
                    {c.status === "suspended" && <Badge tone="red">Suspended</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    @{c.handle} · {formatCount(c.subscriberCount)} subscribers · {c.videoCount} videos · {formatCount(c.totalViews)} views · since {fullDate(c.createdAt)}
                  </p>
                  {c.owner && <p className="truncate text-xs text-muted">Owner: {c.owner.name} ({c.owner.email || c.owner.phone})</p>}
                </div>
                <Toggle on={c.verified} onChange={(v) => save(c, { verified: v }, v ? "Channel verified" : "Verification removed")} label="Verified" />
                <a href={`${SITE_URL}/@${c.handle}`} target="_blank" rel="noreferrer" title="Open channel" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line hover:bg-white/10">
                  <ExternalLink className="h-4 w-4" />
                </a>
                {c.status === "suspended" ? (
                  <Btn onClick={() => save(c, { status: "active" }, "Channel restored")}>
                    <PlayCircle className="h-4 w-4" /> Restore
                  </Btn>
                ) : (
                  <Btn
                    tone="danger"
                    onClick={async () => (await confirmDialog(`Suspend ${c.name}? Its page and videos disappear from the site.`)) && save(c, { status: "suspended" }, "Channel suspended")}
                  >
                    <PauseCircle className="h-4 w-4" /> Suspend
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

export default Channels;
