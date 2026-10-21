"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/UndoToast";
import type { FriendProfile } from "@/lib/domain/types";
import { formatWeight } from "@/lib/domain/units";

function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

function Profile() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { cfg, store, profile: me, now, refresh } = useApp();
  const toast = useToast(cfg.logging.undoToastMs);
  const [p, setP] = useState<FriendProfile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [nick, setNick] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await store.getFriendProfile(id, now());
      setP(r);
      setNick(r?.nickname ?? "");
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [store, id, now]);

  useEffect(() => {
    void load();
  }, [load]);

  const w = (kg: number) => formatWeight(kg, me.unit, 0);

  if (error) return <div className="page"><pre className="code">{error}</pre></div>;
  if (p === undefined) return <div className="page muted">Loading…</div>;
  if (p === null) return <div className="page stack"><Link href="/friends">‹ Friends</Link><p className="muted">Not in your friends list.</p></div>;

  const name = p.nickname || p.displayName;
  const today = p.today;
  const todayText = !today ? "" : today.kind === "rest" ? "Rest day" : today.kind === "no-split" ? "No split set up" : `${today.dayName ?? "Training day"}`;
  const logged = (today?.setsToday ?? 0) > 0;

  return (
    <div className="page stack">
      <Link href="/friends" className="small" style={{ fontWeight: 600 }}>‹ Friends</Link>

      {p.banner && <div className="profile-banner" style={{ backgroundImage: `url(${p.banner})` }} />}
      <div className="row" style={{ gap: 14, flexWrap: "nowrap", marginTop: p.banner ? -44 : 0, paddingLeft: p.banner ? 10 : 0 }}>
        <Avatar id={p.id} name={name} size={64} src={p.avatar} />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: "1.7rem" }}>{name}</h1>
          <div className="muted small">{p.nickname ? `${p.displayName} · ` : ""}{p.shared && p.splitName ? p.splitName : p.shared ? "No active split" : "Keeps their training private"}</div>
        </div>
      </div>

      {editing ? (
        <form className="row" onSubmit={async (e) => { e.preventDefault(); await store.setNickname(p.id, nick); setEditing(false); toast.show({ text: nick.trim() ? `Saved as “${nick.trim()}”` : "Nickname cleared" }); await load(); refresh(); }}>
          <input autoFocus style={{ flex: 1 }} maxLength={40} placeholder={`Nickname for ${p.displayName}`} value={nick} onChange={(e) => setNick(e.target.value)} />
          <button className="btn primary" type="submit">Save</button>
          <button className="btn" type="button" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      ) : (
        <div className="row">
          <button className="chip" onClick={() => setEditing(true)}>{p.nickname ? "Edit nickname" : "Add nickname"}</button>
          <span className="muted small">Only you see it.</span>
        </div>
      )}

      {p.shared && (
        <>
          <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className={`tile ${logged ? "lime" : "hero"}`} style={{ gridColumn: "1 / -1" }}>
              <span className="label">Today</span>
              <span className="value">{todayText}</span>
              <span className="foot">{today?.kind === "day" || logged ? (logged ? `Logged ✓ · ${today?.setsToday} sets` : "Not logged yet") : "—"}</span>
            </div>
            <div className="tile">
              <span className="label">This week</span>
              <span className="value">{p.sessionsThisWeek ?? 0}<small> sessions</small></span>
            </div>
            <div className="tile">
              <span className="label">Last workout</span>
              <span className="value" style={{ fontSize: "1.35rem" }}>{ago(p.lastSessionAt)}</span>
              <span className="foot">{p.sessions30d ?? 0} in the last 30 days</span>
            </div>
          </div>

          {!!p.topLifts?.length && (
            <div className="card stack" style={{ gap: 10 }}>
              <h2>Top lifts (est. 1RM)</h2>
              {p.topLifts.map((l) => (
                <div key={l.exercise} className="spread"><span style={{ fontWeight: 600 }}>{l.exercise}</span><span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{w(l.e1rmKg)}</span></div>
              ))}
            </div>
          )}

          <div className="card stack" style={{ gap: 10 }}>
            <h2>Recent PRs</h2>
            {p.recentPrs?.length ? p.recentPrs.map((r, i) => (
              <div key={i} className="spread">
                <span><span style={{ fontWeight: 600 }}>{r.exercise}</span> <span className="badge">{r.type === "e1rm" ? "e1RM" : "Heaviest"}</span></span>
                <span className="muted small" style={{ textAlign: "right" }}>{w(r.weightKg)} × {r.reps}<br />{ago(r.achievedAt)}</span>
              </div>
            )) : <span className="muted small">No PRs yet.</span>}
          </div>
        </>
      )}

      <button
        className="btn danger"
        style={{ justifySelf: "start" }}
        onClick={async () => { await store.removeFriend(p.id); toast.show({ text: `Removed ${name}` }); refresh(); router.push("/friends"); }}
      >
        Remove friend
      </button>
      {toast.node}
    </div>
  );
}

export default function FriendProfilePage() {
  return (
    <Suspense fallback={<div className="page muted">Loading…</div>}>
      <Profile />
    </Suspense>
  );
}
