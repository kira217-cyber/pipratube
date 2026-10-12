import React from "react";
import { ExternalLink, Trash2 } from "lucide-react";

import { EmptyState, PageHeader, Spinner } from "../components/ui";
import { Badge, Btn, Pager, SearchInput } from "../components/kit";
import { apiError, send, SITE_URL } from "../api/client";
import { usePaged } from "../hooks/usePaged";
import { timeAgo } from "../utils/format";
import { toast, confirmDialog } from "../utils/alerts";

const Comments = () => {
  const list = usePaged("/api/admin/comments");

  const remove = async (comment) => {
    if (!(await confirmDialog("Delete this comment (and its replies)?"))) return;
    try {
      await send("delete", `/api/admin/comments/${comment.id}`);
      toast.success("Comment deleted");
      list.reload();
    } catch (error) {
      toast.error(apiError(error, "Couldn't delete"));
    }
  };

  return (
    <div>
      <PageHeader title="Comments" subtitle={`${list.total} comments`} />
      <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search comment text" />
      <div className="mt-4">
        {list.loading ? (
          <Spinner />
        ) : list.items.length === 0 ? (
          <EmptyState title="No comments found" />
        ) : (
          <div className="divide-y divide-line rounded-2xl border border-line bg-card">
            {list.items.map((c) => (
              <div key={c.id} className="flex gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">
                    <span className="font-semibold text-white">{c.user?.name || "Deleted user"}</span> · {timeAgo(c.createdAt)} {c.isReply && <Badge>Reply</Badge>}
                  </p>
                  <p className="mt-1 whitespace-pre-line break-words text-sm">{c.text}</p>
                  {c.video && (
                    <a href={`${SITE_URL}/watch/${c.video.id}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-[#3ea6ff] hover:underline">
                      on “{c.video.title}” <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <Btn tone="danger" onClick={() => remove(c)} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Btn>
              </div>
            ))}
          </div>
        )}
        <Pager page={list.page} totalPages={list.totalPages} onPage={list.setPage} />
      </div>
    </div>
  );
};

export default Comments;
