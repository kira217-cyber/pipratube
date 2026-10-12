import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { Activity, Clapperboard, Globe, Monitor, Radio, Smartphone, UserCheck, Users } from "lucide-react";

import { Card, PageHeader } from "../components/ui";
import { Badge } from "../components/kit";
import { api, TOKEN_KEY } from "../api/client";
import { timeAgo } from "../utils/format";

const Stat = ({ icon: Icon, label, value, color }) => (
  <Card className="p-4">
    <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${color}26`, color }}>
      <Icon className="h-5 w-5" />
    </span>
    <p className="mt-3 text-3xl font-bold">{value}</p>
    <p className="text-sm text-muted">{label}</p>
  </Card>
);

const Ranked = ({ title, icon: Icon, items, empty, render }) => (
  <Card className="p-4">
    <p className="mb-3 flex items-center gap-2 font-semibold">
      <Icon className="h-5 w-5 text-brand" /> {title}
    </p>
    {items.length === 0 ? (
      <p className="py-6 text-center text-sm text-muted">{empty}</p>
    ) : (
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate">{render(item)}</span>
            <Badge tone="green">{item.viewers ?? item.count}</Badge>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

// Who is on the site right now, what they're watching, and what they do —
// pushed live over a socket, nothing stored.
const LiveAnalytics = () => {
  const [snap, setSnap] = useState(null);
  const [activity, setActivity] = useState([]);
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    const socket = io(`${api.defaults.baseURL}/analytics-admin`, {
      auth: { token: localStorage.getItem(TOKEN_KEY) },
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => setStatus("live"));
    socket.on("disconnect", () => setStatus("reconnecting"));
    socket.on("connect_error", () => setStatus("offline"));
    socket.on("snapshot", setSnap);
    socket.on("activityHistory", (list) => setActivity(list || []));
    socket.on("activity", (entry) => setActivity((list) => [entry, ...list].slice(0, 100)));
    return () => socket.disconnect();
  }, []);

  const s = snap || { online: 0, members: 0, guests: 0, videos: [], liveTv: [], pages: [], sessions: [] };

  return (
    <div className="space-y-5">
      <PageHeader title="Live analytics" subtitle="People on PipraTube right now">
        <span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${status === "live" ? "bg-[#22c55e]/15 text-[#4ade80]" : "bg-amber-400/15 text-amber-300"}`}>
          <span className={`h-2 w-2 rounded-full ${status === "live" ? "animate-pulse bg-[#22c55e]" : "bg-amber-400"}`} />
          {status === "live" ? "Live" : status === "offline" ? "Can't connect" : "Connecting…"}
        </span>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Users} label="Online now" value={s.online} color="#22c55e" />
        <Stat icon={UserCheck} label="Signed in" value={s.members} color="#2f86e6" />
        <Stat icon={Globe} label="Guests" value={s.guests} color="#a855f7" />
        <Stat icon={Clapperboard} label="Watching something" value={s.sessions.filter((x) => x.watching).length} color="#ff3d7f" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Ranked title="Videos being watched" icon={Clapperboard} items={s.videos} empty="Nobody is watching a video" render={(v) => v.title || v.id} />
        <Ranked title="Live TV being watched" icon={Radio} items={s.liveTv} empty="Nobody is on Live TV" render={(v) => v.title || v.id} />
        <Ranked title="Pages open" icon={Globe} items={s.pages} empty="No visitors" render={(p) => p.path} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 font-semibold">Visitors</p>
          {s.sessions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No one is online.</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {s.sessions.map((v) => (
                <li key={v.sessionId} className="flex items-center gap-3 py-2 text-sm">
                  {v.device === "mobile" ? <Smartphone className="h-4 w-4 text-muted" /> : <Monitor className="h-4 w-4 text-muted" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {v.label} {v.role === "member" && <Badge tone="blue">Member</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {v.watching ? `Watching ${v.watching.type === "liveTv" ? "Live TV" : "video"}: ${v.watching.title}` : v.path || "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(v.connectedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <p className="mb-3 flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-brand" /> Live activity
          </p>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Actions like plays, likes and comments appear here as they happen.</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {activity.map((a, i) => (
                <li key={`${a.at}-${i}`} className="py-2 text-sm">
                  <span className="font-medium">{a.label}</span> <span className="text-muted">·</span> {a.action}
                  {a.meta && <span className="text-muted"> — {a.meta}</span>}
                  <span className="block text-xs text-muted">
                    {timeAgo(a.at)}
                    {a.path ? ` · ${a.path}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

export default LiveAnalytics;
