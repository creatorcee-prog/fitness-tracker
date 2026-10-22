"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { supabaseOf } from "@/lib/store";
import type { ReviewData, Suggestion } from "@/lib/synonyms/review";

/**
 * App owner only: review synonyms before they apply to everyone. Approving
 * makes "<alias>" find the lift for every user; rejecting stops it being
 * suggested or applied from votes again.
 */
export default function SynonymReview() {
  const { store } = useApp();
  const sb = supabaseOf(store);
  const [data, setData] = useState<ReviewData | null>(null);
  const [ai, setAi] = useState<Suggestion[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(
    async (method: "GET" | "POST", body?: unknown) => {
      if (!sb) throw new Error("Synonym review needs the Supabase backend.");
      const { data: s } = await sb.sb.auth.getSession();
      const res = await fetch("/api/synonyms", {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message ?? "Failed");
      return json;
    },
    [sb],
  );

  const load = useCallback(async () => {
    try {
      setData(await call("GET"));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }, [call]);
  useEffect(() => void load(), [load]);

  const act = async (body: Record<string, unknown>, after?: () => void) => {
    setBusy(true);
    setMsg(null);
    try {
      await call("POST", body);
      after?.();
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const askAi = async (mode: "misses" | "library") => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await call("POST", { action: "suggest", mode });
      setAi(r.suggestions);
      if (!r.suggestions.length) setMsg("No new suggestions.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const drop = (s: Suggestion) => setAi((xs) => xs.filter((x) => x !== s));
  const row = (s: Suggestion, source: string, after?: () => void) => (
    <li key={`${s.alias}|${s.exerciseId}`} className="row" style={{ justifyContent: "space-between" }}>
      <span className="small">
        <strong>&ldquo;{s.alias}&rdquo;</strong> → {s.exercise}
        {s.users ? <span className="muted"> · {s.users} {s.users === 1 ? "person" : "people"}</span> : null}
      </span>
      <span className="row">
        <button className="btn sm primary" disabled={busy} onClick={() => act({ action: "approve", alias: s.alias, exerciseId: s.exerciseId, source }, after)}>Approve</button>
        <button className="btn sm" disabled={busy} onClick={() => act({ action: "reject", alias: s.alias, exerciseId: s.exerciseId }, after)}>Reject</button>
      </span>
    </li>
  );

  return (
    <div className="stack">
      <h1>Synonym review</h1>
      <p className="muted small">
        Approved synonyms apply to everyone. Corrections from 3+ people already apply automatically; approve them to keep them, or reject to switch them off.
        Only names and counts are shown here, never who typed them. <Link href="/settings">Back to Settings</Link>
      </p>
      {msg && <p className="small" style={{ color: "var(--bad)" }}>{msg}</p>}

      <div className="card stack">
        <h2>Ask the AI</h2>
        <p className="muted small">Suggestions are checked (real library lift, not already taken, not rejected before) and wait for you here. Each request counts toward your daily AI limit.</p>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => askAi("misses")}>Match missed names</button>
          <button className="btn" disabled={busy} onClick={() => askAi("library")}>Suggest synonyms for library lifts</button>
        </div>
        {ai.length > 0 && <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>{ai.map((s) => row(s, "ai", () => drop(s)))}</ul>}
      </div>

      {data && (
        <>
          <div className="card stack">
            <h2>Corrections from people</h2>
            {data.votes.length === 0 ? <p className="muted small">None yet.</p> : <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>{data.votes.map((s) => row(s, "votes"))}</ul>}
          </div>

          <div className="card stack">
            <h2>Names that matched nothing</h2>
            {data.misses.length === 0 ? <p className="muted small">None yet.</p> : (
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {data.misses.map((m) => (
                  <li key={m.name} className="row" style={{ justifyContent: "space-between" }}>
                    <span className="small"><strong>&ldquo;{m.name}&rdquo;</strong> <span className="muted">× {m.times}{m.guess ? ` · typo for ${m.guess.exercise}` : ""}</span></span>
                    <span className="row">
                      {m.guess && <button className="btn sm" disabled={busy} onClick={() => act({ action: "approve", alias: m.name, exerciseId: m.guess!.exerciseId, source: "review" })}>Approve</button>}
                      <button className="btn sm ghost" disabled={busy} onClick={() => act({ action: "dismiss", name: m.name })}>Dismiss</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card stack">
            <h2>Approved ({data.approved.length})</h2>
            {data.approved.length === 0 ? <p className="muted small">None yet.</p> : (
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {data.approved.map((a) => (
                  <li key={a.alias} className="row" style={{ justifyContent: "space-between" }}>
                    <span className="small"><strong>&ldquo;{a.alias}&rdquo;</strong> → {a.exercise} <span className="muted">· {a.source}</span></span>
                    <button className="btn sm ghost" disabled={busy} onClick={() => act({ action: "reject", alias: a.alias, exerciseId: a.exerciseId })}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
