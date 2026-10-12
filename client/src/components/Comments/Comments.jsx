import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronUp, EllipsisVertical, Heart, ListFilter, MessageSquareOff, Pencil, Pin, ThumbsUp, Trash2 } from "lucide-react";

import { Avatar, Spinner } from "../ui/ui";
import {
  addComment,
  deleteComment,
  editComment,
  heartComment,
  likeComment,
  listComments,
  listReplies,
  pinComment,
} from "../../api/engage";
import { api } from "../../api/axios";
import { apiError, studioApi, TOKEN_KEY } from "../../api/studioApi";
import { useAuth } from "../../context/AuthContext";
import { useRequireSignIn } from "../../hooks/useRequireSignIn";
import { formatCount, timeAgo } from "../../utils/format";
import { toast, confirmDialog } from "../../utils/alerts";

const client = () => (localStorage.getItem(TOKEN_KEY) ? studioApi : api);

// Text box that grows into "Cancel / Comment" once focused.
const Composer = ({ placeholder, submitLabel = "Comment", autoFocus, initial = "", onSubmit, onCancel, compact }) => {
  const { user, channel } = useAuth();
  const requireSignIn = useRequireSignIn();
  const [text, setText] = useState(initial);
  const [active, setActive] = useState(Boolean(autoFocus || initial));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onSubmit(text.trim());
      setText("");
      setActive(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-3">
      {!compact && <Avatar src={channel?.avatar || user?.avatar} name={channel?.name || user?.name || "?"} size="h-10 w-10" ring={false} />}
      <div className="min-w-0 flex-1">
        <textarea
          rows={1}
          autoFocus={autoFocus}
          value={text}
          maxLength={2000}
          placeholder={placeholder}
          onFocus={() => {
            if (!requireSignIn("Sign in to comment")) return;
            setActive(true);
          }}
          onChange={(event) => {
            setText(event.target.value);
            event.target.style.height = "auto";
            event.target.style.height = `${event.target.scrollHeight}px`;
          }}
          className="w-full resize-none border-b border-white/20 bg-transparent pb-1 text-sm text-white outline-none placeholder:text-muted focus:border-white"
        />
        {active && (
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setText(initial);
                setActive(false);
                onCancel?.();
              }}
              className="cursor-pointer rounded-full px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!text.trim() || busy}
              onClick={submit}
              className="cursor-pointer rounded-full bg-[#3ea6ff] px-4 py-2 text-sm font-semibold text-black disabled:cursor-default disabled:bg-white/10 disabled:text-muted"
            >
              {submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const ExpandableText = ({ text }) => {
  const [open, setOpen] = useState(false);
  const long = text.length > 280 || text.split("\n").length > 4;
  return (
    <div>
      <p className={`whitespace-pre-line break-words text-sm text-slate-100 ${open || !long ? "" : "line-clamp-4"}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 cursor-pointer text-sm font-semibold text-muted hover:text-white">
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
};

const CommentItem = ({ comment, videoId, isOwner, creator, onChanged, onRemoved, onReplyAdded, isReply }) => {
  const requireSignIn = useRequireSignIn();
  const [item, setItem] = useState(comment);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replies, setReplies] = useState(null);
  const [showReplies, setShowReplies] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (event) => !menuRef.current?.contains(event.target) && setMenu(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  const update = (patch) => {
    const next = { ...item, ...patch };
    setItem(next);
    onChanged?.(next);
  };

  const toggleLike = async () => {
    if (!requireSignIn("Sign in to like comments")) return;
    const optimistic = { liked: !item.liked, likes: item.likes + (item.liked ? -1 : 1) };
    update(optimistic);
    try {
      const result = await likeComment(item.id);
      update({ liked: result.liked, likes: result.likes });
    } catch {
      update({ liked: item.liked, likes: item.likes });
    }
  };

  const loadReplies = async () => {
    if (!showReplies && !replies) {
      try {
        const result = await listReplies(client(), item.id);
        setReplies(result.replies);
      } catch {
        setReplies([]);
      }
    }
    setShowReplies((v) => !v);
  };

  const run = async (task, success) => {
    setMenu(false);
    try {
      const result = await task();
      if (success) toast.success(success);
      return result;
    } catch (error) {
      toast.error(apiError(error, "Something went wrong"));
      return null;
    }
  };

  const author = item.author;
  const authorTo = author.handle ? `/@${author.handle}` : null;
  const name = author.handle ? `@${author.handle}` : author.name;

  return (
    <div className="flex gap-3">
      {authorTo ? (
        <Link to={authorTo} className="shrink-0">
          <Avatar src={author.avatar} name={author.name} size={isReply ? "h-7 w-7" : "h-10 w-10"} ring={false} />
        </Link>
      ) : (
        <Avatar src={author.avatar} name={author.name} size={isReply ? "h-7 w-7" : "h-10 w-10"} ring={false} />
      )}

      <div className="min-w-0 flex-1">
        {item.pinned && (
          <p className="mb-1 flex items-center gap-1 text-xs text-muted">
            <Pin className="h-3.5 w-3.5" /> Pinned by {creator?.handle ? `@${creator.handle}` : creator?.name}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13px]">
          <span className={item.isCreator ? "rounded-full bg-white/15 px-2 font-semibold text-white" : "font-semibold text-white"}>{name}</span>
          <span className="text-muted">
            {timeAgo(item.createdAt)}
            {item.edited ? " (edited)" : ""}
          </span>
        </p>

        {editing ? (
          <div className="mt-2">
            <Composer
              compact
              autoFocus
              initial={item.text}
              submitLabel="Save"
              onCancel={() => setEditing(false)}
              onSubmit={async (text) => {
                const result = await run(() => editComment(item.id, text));
                if (result) {
                  update({ text: result.text, edited: true });
                  setEditing(false);
                }
              }}
            />
          </div>
        ) : (
          <div className="mt-0.5">
            <ExpandableText text={item.text} />
          </div>
        )}

        <div className="mt-1 flex items-center gap-1 text-xs text-muted">
          <button type="button" onClick={toggleLike} className="flex cursor-pointer items-center gap-1.5 rounded-full p-1.5 hover:bg-white/10" aria-label="Like comment">
            <ThumbsUp className={`h-4 w-4 ${item.liked ? "fill-white text-white" : ""}`} />
            {item.likes > 0 && <span>{formatCount(item.likes)}</span>}
          </button>
          {item.hearted && (
            <span className="relative ml-1 mr-1" title={`Hearted by ${creator?.name || "creator"}`}>
              <Avatar src={creator?.avatar} name={creator?.name} size="h-5 w-5" ring={false} />
              <Heart className="absolute -bottom-1 -right-1 h-3 w-3 fill-live text-live" />
            </span>
          )}
          {!isReply && (
            <button
              type="button"
              onClick={() => requireSignIn("Sign in to reply") && setReplying(true)}
              className="cursor-pointer rounded-full px-3 py-1.5 font-semibold text-white hover:bg-white/10"
            >
              Reply
            </button>
          )}
        </div>

        {replying && (
          <div className="mt-2">
            <Composer
              compact
              autoFocus
              placeholder="Add a reply…"
              submitLabel="Reply"
              onCancel={() => setReplying(false)}
              onSubmit={async (text) => {
                const result = await run(() => addComment(videoId, text, item.id));
                if (result) {
                  setReplies((list) => [...(list || []), result.comment]);
                  setShowReplies(true);
                  update({ replyCount: item.replyCount + 1 });
                  setReplying(false);
                  onReplyAdded?.();
                }
              }}
            />
          </div>
        )}

        {!isReply && item.replyCount > 0 && (
          <button type="button" onClick={loadReplies} className="mt-1 flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-[#3ea6ff] hover:bg-[#3ea6ff]/10">
            {showReplies ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {item.replyCount} {item.replyCount === 1 ? "reply" : "replies"}
          </button>
        )}

        {showReplies && replies && (
          <div className="mt-2 space-y-4">
            {replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                videoId={videoId}
                isOwner={isOwner}
                creator={creator}
                isReply
                onRemoved={() => {
                  setReplies((list) => list.filter((r) => r.id !== reply.id));
                  update({ replyCount: Math.max(0, item.replyCount - 1) });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {(item.mine || isOwner) && (
        <div ref={menuRef} className="relative shrink-0">
          <button type="button" aria-label="Comment actions" onClick={() => setMenu((v) => !v)} className="cursor-pointer rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-white">
            <EllipsisVertical className="h-5 w-5" />
          </button>
          {menu && (
            <div className="absolute right-0 top-full z-40 w-44 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-2xl shadow-black/60">
              {isOwner && !isReply && (
                <button
                  type="button"
                  onClick={async () => {
                    const result = await run(() => pinComment(item.id), item.pinned ? "Unpinned" : "Pinned");
                    if (result) onChanged?.({ ...item, pinned: result.pinned }, { refresh: true });
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/5"
                >
                  <Pin className="h-4 w-4" /> {item.pinned ? "Unpin" : "Pin"}
                </button>
              )}
              {isOwner && (
                <button
                  type="button"
                  onClick={async () => {
                    const result = await run(() => heartComment(item.id));
                    if (result) update({ hearted: result.hearted });
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/5"
                >
                  <Heart className="h-4 w-4" /> {item.hearted ? "Remove heart" : "Heart"}
                </button>
              )}
              {item.mine && (
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    setEditing(true);
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/5"
                >
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  if (!(await confirmDialog("Delete this comment?"))) return;
                  const result = await run(() => deleteComment(item.id), "Comment deleted");
                  if (result) onRemoved?.(result.removed);
                }}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-[#f87171] hover:bg-white/5"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// The whole comment section for one video.
const Comments = ({ videoId, creator, onCountChange }) => {
  const [sort, setSort] = useState("top");
  const [state, setState] = useState({ key: null, comments: [], page: 1, totalPages: 1, count: 0, allow: true, isOwner: false });
  const [sortOpen, setSortOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const key = `${videoId}|${sort}`;

  const load = useCallback(
    (page = 1) =>
      listComments(client(), videoId, { sort, page }).then((result) => ({
        comments: result.comments,
        page: result.page,
        totalPages: result.totalPages,
        count: result.commentCount,
        allow: result.allowComments,
        isOwner: result.isOwner,
      })),
    [videoId, sort],
  );

  useEffect(() => {
    let cancelled = false;
    load(1)
      .then((result) => !cancelled && setState({ key, ...result }))
      .catch(() => !cancelled && setState((s) => ({ ...s, key })));
    return () => {
      cancelled = true;
    };
  }, [key, load]);

  const setCount = (count) => {
    setState((s) => ({ ...s, count }));
    onCountChange?.(count);
  };

  const refresh = () => load(1).then((result) => setState({ key, ...result }));

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const result = await load(state.page + 1);
      setState((s) => ({ ...s, comments: [...s.comments, ...result.comments], page: result.page, totalPages: result.totalPages }));
    } finally {
      setLoadingMore(false);
    }
  };

  if (state.key !== key) return <Spinner className="py-8" />;

  return (
    <section>
      <div className="flex items-center gap-6">
        <h2 className="text-lg font-bold">
          {formatCount(state.count)} {state.count === 1 ? "Comment" : "Comments"}
        </h2>
        <div className="relative">
          <button type="button" onClick={() => setSortOpen((v) => !v)} className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <ListFilter className="h-5 w-5" /> Sort by
          </button>
          {sortOpen && (
            <div className="absolute left-0 top-full z-40 mt-2 w-40 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-2xl">
              {[
                ["top", "Top comments"],
                ["newest", "Newest first"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSort(value);
                    setSortOpen(false);
                  }}
                  className={`block w-full cursor-pointer px-4 py-2.5 text-left text-sm hover:bg-white/5 ${sort === value ? "bg-white/10" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {state.allow ? (
        <div className="mt-5">
          <Composer
            placeholder="Add a comment…"
            onSubmit={async (text) => {
              try {
                const result = await addComment(videoId, text);
                setState((s) => ({ ...s, comments: [result.comment, ...s.comments] }));
                setCount(state.count + 1);
              } catch (error) {
                toast.error(apiError(error, "Couldn't post your comment"));
                throw error;
              }
            }}
          />
        </div>
      ) : (
        <p className="mt-5 flex items-center gap-2 text-sm text-muted">
          <MessageSquareOff className="h-5 w-5" /> Comments are turned off.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {state.comments.map((comment) => (
          <CommentItem
            // Pinning reorders the list from the server; a new key lets the
            // item start again from that fresh copy.
            key={`${comment.id}-${comment.pinned}`}
            comment={comment}
            videoId={videoId}
            isOwner={state.isOwner}
            creator={creator}
            onChanged={(next, options) => {
              if (options?.refresh) refresh();
              else setState((s) => ({ ...s, comments: s.comments.map((c) => (c.id === next.id ? next : c)) }));
            }}
            onRemoved={(removed) => {
              setState((s) => ({ ...s, comments: s.comments.filter((c) => c.id !== comment.id) }));
              setCount(Math.max(0, state.count - (removed || 1)));
            }}
            onReplyAdded={() => setCount(state.count + 1)}
          />
        ))}
      </div>

      {state.page < state.totalPages && (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={loadMore} disabled={loadingMore} className="cursor-pointer rounded-full border border-line px-5 py-2 text-sm font-semibold hover:bg-white/5">
            {loadingMore ? "Loading…" : "Show more comments"}
          </button>
        </div>
      )}
    </section>
  );
};

export default Comments;
