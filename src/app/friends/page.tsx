"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { Avatar } from "@/components/Avatar";
import { FriendQr } from "@/components/FriendQr";
import { useToast } from "@/components/UndoToast";
import type { FriendRequest, FriendStatus } from "@/lib/domain/types";

const RESULT: Record<string, string> = {
  sent: "Request sent",
  accepted: "You're now friends",
  "not-found": "No one has that code",
  self: "That's your own code",
};

function statusLine(f: FriendStatus): { dot: string; text: string } {
  if (f.kind === "hidden") return { dot: "", text: "Status hidden" };
  if (f.kind === "no-split") return { dot: (f.setsToday ?? 0) > 0 ? "good" : "", text: (f.setsToday ?? 0) > 0 ? `No split · ${f.setsToday} sets today` : "No split set up" };
  if (f.kind === "rest") return { dot: (f.setsToday ?? 0) > 0 ? "good" : "", text: (f.setsToday ?? 0) > 0 ? `Rest day, trained anyway · ${f.setsToday} sets` : "Rest day" };
  return (f.setsToday ?? 0) > 0
    ? { dot: "good", text: `${f.dayName} · logged ✓ (${f.setsToday} sets)` }
    : { dot: "wait", text: `${f.dayName} · not logged yet` };
}

export default function FriendsPage() {
  const { cfg, store, version, refresh, now } = useApp();
  const [friends, setFriends] = useState<FriendStatus[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [code, setCode] = useState("");
  const [myCode, setMyCode] = useState("");
  const [share, setShare] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast(cfg.logging.undoToastMs);

  const load = useCallback(async () => {
    try {
      const [f, r, c, s] = await Promise.all([store.friendsToday(now()), store.listFriendRequests(), store.getFriendCode(), store.getShareStatus()]);
      setFriends(f);
      setRequests(r);
      setMyCode(c);
      setShare(s);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [store, now]);

  useEffect(() => {
    void load();
    if (!cfg.friends.pollMs) return;
    const id = setInterval(load, cfg.friends.pollMs);
    return () => clearInterval(id);
  }, [load, version, cfg.friends.pollMs]);

  if (!cfg.friends.enabled) return <div className="page"><h1>Friends</h1><p className="muted">Disabled in config (friends.enabled).</p></div>;

  const lifting = friends.filter((f) => f.kind === "day");
  const logged = lifting.filter((f) => (f.setsToday ?? 0) > 0).length;

  return (
    <div className="page stack">
      <h1>Friends</h1>
      {store.kind === "local" && <p className="muted small">Local mode: these are demo friends from config (friends.demoFriends). Use the Supabase backend for real ones.</p>}
      {error && <pre className="code">{error}</pre>}

      <div className="tile hero">
        <span className="small" style={{ opacity: 0.8 }}>Lift days today</span>
        <span style={{ fontSize: "1.8rem", fontWeight: 700 }}>{logged}/{lifting.length} logged</span>
      </div>

      {requests.length > 0 && (
        <div className="card stack">
          <h2>Requests</h2>
          {requests.map((r) => (
            <div key={r.requesterId} className="spread">
              <span>{r.displayName}</span>
              <div className="row">
                <button className="btn sm primary" onClick={async () => { await store.acceptFriendRequest(r.requesterId); refresh(); }}>Accept</button>
                <button className="btn sm" onClick={async () => { await store.removeFriend(r.requesterId); refresh(); }}>Ignore</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="stack">
        {friends.length === 0 && <p className="muted">No friends yet. Share your code below.</p>}
        {friends.map((f) => {
          const s = statusLine(f);
          return (
            <Link key={f.friendId} href={`/friends/profile?id=${encodeURIComponent(f.friendId)}`} className="card friend" style={{ color: "inherit" }}>
              <Avatar id={f.friendId} name={f.nickname || f.displayName} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{f.nickname || f.displayName}</strong>
                {f.nickname && <span className="muted small"> · {f.displayName}</span>}
                <div className="muted small"><span className={`dot ${s.dot}`} /> {s.text}</div>
              </div>
              <span className="muted" aria-hidden style={{ fontSize: "1.3rem" }}>›</span>
            </Link>
          );
        })}
      </div>

      <div className="card stack">
        <h2>Add a friend</h2>
        <p className="muted small">Have a friend scan this with their phone camera, or share the link. You'll still accept their request.</p>
        <FriendQr code={myCode} />
        <div className="muted small" style={{ textAlign: "center" }}>Your code: <strong style={{ fontFamily: "var(--mono)", color: "var(--text)" }}>{myCode}</strong></div>
        <form className="row" onSubmit={async (e) => { e.preventDefault(); const r = await store.sendFriendRequest(code); toast.show({ text: RESULT[r] ?? r }); setCode(""); refresh(); }}>
          <input style={{ flex: 1 }} placeholder={store.kind === "local" ? "Name (local demo)" : "Friend code"} value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn primary" type="submit" disabled={!code.trim()}>Add</button>
        </form>
        <label className="row small">
          <input type="checkbox" checked={share} onChange={async (e) => { await store.setShareStatus(e.target.checked); setShare(e.target.checked); }} />
          Share my split day and whether I've logged today with friends
        </label>
      </div>
      {toast.node}
    </div>
  );
}
