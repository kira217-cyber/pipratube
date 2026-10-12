import React, { useEffect, useState } from "react";
import { Clock, Globe, Link2, Lock, Plus, X } from "lucide-react";

import { Spinner } from "../ui/ui";
import { createPlaylist, myPlaylists, togglePlaylistVideo } from "../../api/engage";
import { apiError } from "../../api/studioApi";
import { toast } from "../../utils/alerts";

const VIS_ICON = { public: Globe, unlisted: Link2, private: Lock };

// YouTube's "Save video to…" sheet: tick Watch later or any playlist,
// or make a new one on the spot.
const SaveDialog = ({ videoId, onClose, onChange }) => {
  const [lists, setLists] = useState(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState("private");

  useEffect(() => {
    let cancelled = false;
    myPlaylists(videoId)
      .then((result) => !cancelled && setLists(result.playlists))
      .catch(() => !cancelled && setLists([]));
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = async (list) => {
    const add = !list.hasVideo;
    setLists((all) => all.map((l) => (l.id === list.id ? { ...l, hasVideo: add } : l)));
    try {
      const result = await togglePlaylistVideo(list.id, videoId, add);
      toast.success(add ? `Saved to ${list.title}` : `Removed from ${list.title}`);
      if (list.kind === "watch_later") onChange?.({ watchLater: result.hasVideo });
    } catch (error) {
      setLists((all) => all.map((l) => (l.id === list.id ? { ...l, hasVideo: !add } : l)));
      toast.error(apiError(error, "Couldn't save"));
    }
  };

  const create = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      const result = await createPlaylist({ title: title.trim(), visibility, video: videoId });
      setLists((all) => [...all, { ...result.playlist, hasVideo: true }]);
      toast.success(`Saved to ${result.playlist.title}`);
      setCreating(false);
      setTitle("");
    } catch (error) {
      toast.error(apiError(error, "Couldn't create the playlist"));
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-2xl border border-line bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold">Save video to…</p>
          <button type="button" aria-label="Close" onClick={onClose} className="cursor-pointer rounded-full p-1 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {lists === null ? (
          <Spinner className="py-6" />
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {lists.map((list) => {
              const Icon = list.kind === "watch_later" ? Clock : VIS_ICON[list.visibility] || Lock;
              return (
                <li key={list.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
                    <input type="checkbox" checked={Boolean(list.hasVideo)} onChange={() => toggle(list)} className="h-5 w-5 accent-white" />
                    <span className="min-w-0 flex-1 truncate text-sm">{list.title}</span>
                    <Icon className="h-4 w-4 text-muted" />
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {creating ? (
          <form onSubmit={create} className="mt-3 space-y-3 border-t border-line pt-3">
            <input
              autoFocus
              value={title}
              maxLength={150}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Playlist name"
              className="h-11 w-full rounded-xl border border-white/15 bg-black/20 px-3 text-sm text-white outline-none focus:border-white"
            />
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value)}
              className="h-11 w-full cursor-pointer rounded-xl border border-white/15 bg-black/20 px-3 text-sm text-white outline-none [color-scheme:dark]"
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
            <div className="flex justify-end">
              <button type="submit" disabled={!title.trim()} className="cursor-pointer rounded-full bg-[#3ea6ff] px-4 py-2 text-sm font-semibold text-black disabled:bg-white/10 disabled:text-muted">
                Create
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setCreating(true)} className="mt-3 flex w-full cursor-pointer items-center gap-3 rounded-lg border-t border-line px-2 pt-3 text-sm font-semibold hover:text-white">
            <Plus className="h-5 w-5" /> Create new playlist
          </button>
        )}
      </div>
    </div>
  );
};

export default SaveDialog;
