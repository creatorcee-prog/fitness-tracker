"use client";

import { useEffect, useState } from "react";
import type { LeaderboardRow } from "@/lib/domain/leaderboard";
import { useApp } from "./AppProvider";

const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
const MEDAL = ["🥇", "🥈", "🥉"];

/**
 * Friends leaderboard by % strength gain (opt-in). Percent rather than pounds,
 * so a beginner and a veteran compete on progress, not size. Only the % and
 * lift name are shared, never weights.
 */
export function LeaderboardCard() {
  const { store, version, now } = useApp();
  const [data, setData] = useState<{ optedIn: boolean; rows: LeaderboardRow[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    store.getLeaderboard(now()).then(setData, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [store, version, now]);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await store.setLeaderboardOptIn(on);
      setData(await store.getLeaderboard(now()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="card"><h2>Leaderboard</h2><p className="muted small">{error}</p></div>;
  if (!data) return null;
  const ranked = data.rows.filter((r) => r.avgGain != null);
  const waiting = data.rows.filter((r) => r.avgGain == null);

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>🏆 Leaderboard</h2>
        {data.optedIn && <button className="btn sm ghost" disabled={busy} onClick={() => toggle(false)}>Leave</button>}
      </div>
      {!data.optedIn ? (
        <>
          <p className="muted small">
            Ranks you and friends who join by <strong>% strength gain</strong>: your best estimated 1RM per lift over the last 4 weeks vs 2–3 months ago.
            Percent, not pounds, so everyone competes on progress. Only your % and top lift are shared, never your weights.
          </p>
          <button className="btn primary" disabled={busy} onClick={() => toggle(true)}>Join the leaderboard</button>
        </>
      ) : (
        <>
          {ranked.length === 0 && <p className="muted small">Nobody has enough history yet. A lift counts once it was logged both 2–3 months ago and in the last 4 weeks.</p>}
          <ol className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {ranked.map((r, i) => (
              <li key={r.userId} className="row" style={{ justifyContent: "space-between", fontWeight: r.isYou ? 700 : undefined }}>
                <span>{MEDAL[i] ?? `${i + 1}.`} {r.name}{r.isYou ? " (you)" : ""}</span>
                <span style={{ textAlign: "right" }}>
                  <strong style={{ color: r.avgGain! >= 0 ? "var(--good)" : "var(--muted)" }}>{pct(r.avgGain!)}</strong>
                  <span className="muted small"> · {r.lifts} lift{r.lifts === 1 ? "" : "s"}{r.topLift ? ` · ${r.topLift} ${pct(r.topGain!)}` : ""}</span>
                </span>
              </li>
            ))}
          </ol>
          {waiting.length > 0 && <p className="muted small">Not enough history yet: {waiting.map((r) => (r.isYou ? "you" : r.name)).join(", ")}</p>}
          <p className="muted small">Friends appear once they join (here or with <code>/leaderboard join</code> in Discord).</p>
        </>
      )}
    </div>
  );
}
