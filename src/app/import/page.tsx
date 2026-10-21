"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { useToast } from "@/components/UndoToast";
import { applyAction, describeAction } from "@/lib/ai/actions";
import { buildImport, type ImportChoices } from "@/lib/import/build";
import { detectCsv, isProgramCsv, readProgramCsv, readWorkoutCsv } from "@/lib/import/csv";
import { inferProgram } from "@/lib/import/infer";
import { readWorkoutText } from "@/lib/import/text";
import type { ImportedData, ImportedProgram } from "@/lib/import/types";
import type { Exercise } from "@/lib/domain/types";
import { supabaseOf } from "@/lib/store";
import { uid } from "@/lib/store/local";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EXAMPLE = `Goal: bench 225 by 2027-03-01

Oct 14 - Push
Bench press 185x5x3
OHP 115 8,8,7
Dips 3x10

Oct 16 - Pull
Deadlift 315x5
Barbell row 155x8x3
Pull-ups 3x8`;

/**
 * Import old workouts: a Strong/Hevy CSV or notes. Read in the browser
 * (free, exact), or by James for messy notes. Everything is previewed;
 * nothing is saved until you press Import.
 */
export default function ImportPage() {
  const { cfg, store, profile, now, refresh } = useApp();
  const toast = useToast(cfg.logging.undoToastMs);
  const sb = supabaseOf(store);
  const bot = cfg.brand.botName;
  const [text, setText] = useState("");
  const [data, setData] = useState<ImportedData | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [choices, setChoices] = useState<ImportChoices>({ history: true, program: true, activate: false, goals: true });
  const [done, setDone] = useState<string | null>(null);

  // Day names can be renamed in the preview (e.g. a code like "RE" you'd rather call "Recovery").
  const [dayNames, setDayNames] = useState<Record<number, string>>({});
  const program: ImportedProgram | null = useMemo(() => {
    const p = data ? data.program ?? inferProgram(data.sessions) : null;
    return p ? { ...p, days: p.days.map((d, i) => ({ ...d, name: dayNames[i]?.trim() || d.name })) } : null;
  }, [data, dayNames]);
  const built = useMemo(() => (data ? buildImport(data, program, exercises, choices, cfg, uid) : null), [data, program, exercises, choices, cfg]);

  const show = async (d: ImportedData) => {
    setExercises(await store.listExercises());
    setData(d);
    setDone(null);
    setDayNames({});
    // A plan with no history is almost always meant to become the split you follow.
    setChoices({ history: d.sessions.length > 0, program: true, activate: !d.sessions.length && !!d.program, goals: d.goals.length > 0 });
    if (!d.sessions.length && !d.program && !d.goals.length) setErr(`Nothing I could read as workouts.${sb ? ` Try “Have ${bot} read it”.` : ""}`);
  };

  const readLocally = async () => {
    setErr(null);
    const csv = detectCsv(text);
    const d = csv ? readWorkoutCsv(text, profile.unit)
      : isProgramCsv(text) ? readProgramCsv(text, profile.unit, { sets: cfg.import.defaultSets, reps: cfg.import.defaultReps })
      : readWorkoutText(text, profile.unit, now());
    await show(d);
  };

  const readWithJames = async () => {
    if (!sb) return;
    setErr(null);
    setBusy(`${bot} is reading…`);
    try {
      const { data: s } = await sb.sb.auth.getSession();
      const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` }, body: JSON.stringify({ text }) });
      const json = (await res.json()) as { ok: boolean; data?: ImportedData; message?: string };
      if (json.ok && json.data) await show(json.data);
      else setErr(json.message ?? "Something went wrong.");
    } catch {
      setErr(navigator.onLine ? "Couldn't reach the server. Try again." : "You're offline.");
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    if (!data || !built) return;
    setBusy("Importing…");
    setErr(null);
    try {
      const before = new Set((await store.listSplits()).map((s) => s.id));
      const r = await store.importAll(built.exportData);
      const parts: string[] = [];
      if (choices.history && data.sessions.length) parts.push(r ? `Imported ${r.sessions} workouts, ${r.sets} sets${r.skipped ? ` (${r.skipped} were already here)` : ""}` : "Imported your workouts");
      if (choices.program && program) {
        const added = (await store.listSplits()).find((s) => !before.has(s.id));
        if (added && choices.activate) await store.setActiveSplit(added.id);
        parts.push(`Saved your ${program.days.length}-day split${choices.activate ? " as your active split" : ""}`);
      }
      let msg = parts.join(" · ") || "Imported";
      if (choices.goals && data.goals.length) {
        let ok = 0;
        for (const g of data.goals) {
          try {
            await applyAction(g, { store, cfg, profile, now, newId: uid, patchConfig: () => {} });
            ok++;
          } catch {
            /* a goal for a lift that wasn't found: listed as skipped below */
          }
        }
        msg += ` · ${ok} goal${ok === 1 ? "" : "s"}`;
      }
      setDone(msg);
      setData(null);
      setText("");
      refresh();
    } catch (e) {
      setErr(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setText(await f.text());
  };

  const check = (k: keyof ImportChoices, label: string, disabled = false) => (
    <label className="row small" style={{ opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" disabled={disabled} checked={choices[k] && !disabled} onChange={(e) => setChoices({ ...choices, [k]: e.target.checked })} /> {label}
    </label>
  );

  return (
    <div className="page stack">
      <Link href="/settings" className="small" style={{ fontWeight: 600 }}>‹ Settings</Link>
      <h1>Import old workouts</h1>

      {done && (
        <div className="card stack">
          <strong>✓ {done}</strong>
          <div className="row"><Link className="btn" href="/progress">See progress</Link><Link className="btn" href="/split">See split</Link></div>
        </div>
      )}

      {!data && (
        <div className="card stack">
          <p className="muted small" style={{ margin: 0 }}>
            Paste your log or choose a file. <strong>Strong</strong> and <strong>Hevy</strong> CSV exports, program tables (a day column and an exercise column, like a split spreadsheet) and notes like the example are read right here (free, exact).
            {sb ? <> For messier notes or spreadsheets, <strong>Have {bot} read it</strong> (uses one of today&apos;s {bot} requests; up to about 8,000 characters at a time).</> : null}
            {" "}You&apos;ll see everything before it&apos;s saved.
          </p>
          <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} aria-label="Workout log" spellCheck={false} />
          <div className="row">
            <label className="btn">Choose file<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={onFile} /></label>
            <button className="btn primary" disabled={!text.trim() || !!busy} onClick={readLocally}>Read it</button>
            {sb && <button className="btn" disabled={!text.trim() || !!busy} onClick={readWithJames}>Have {bot} read it</button>}
          </div>
          {busy && <span className="muted small">{busy}</span>}
          {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}
        </div>
      )}

      {data && built && (
        <>
          <div className="card stack">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Preview</h2>
              <button className="btn sm ghost" onClick={() => setData(null)}>Back</button>
            </div>
            <div className="small">
              {!data.sessions.length && data.program ? "A program (no dated workouts, so nothing is added to your history)." : data.sessions.length ? <><strong>{data.sessions.length}</strong> workouts, <strong>{data.sessions.reduce((a, s) => a + s.sets.length, 0)}</strong> sets, {data.sessions[0].date} → {data.sessions[data.sessions.length - 1].date}</> : "No dated workouts."}
              <span className="muted"> · read by {data.format === "ai" ? bot : data.format === "text" ? "the notes reader" : data.format === "hevy-csv" ? "the Hevy reader" : data.format === "program-csv" ? "the program-table reader" : "the Strong reader"}</span>
            </div>
            {data.sessions.length > 0 && (
              <details>
                <summary className="small">Latest workouts, as read</summary>
                <ul className="setlist">
                  {data.sessions.slice(-4).reverse().map((s, i) => (
                    <li key={i} style={{ display: "block" }}>
                      <strong className="small">{s.date}{s.dayName ? ` · ${s.dayName}` : ""}</strong>
                      <div className="muted small">
                        {[...new Set(s.sets.map((x) => x.exercise))].map((e) => `${e} ${s.sets.filter((x) => x.exercise === e).map((x) => `${x.weight}×${x.reps}`).join(", ")}`).join(" · ")}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {built.preview.lifts.length > 0 && (
            <div className="card stack">
              <h2 style={{ margin: 0 }}>Lifts</h2>
              <ul className="setlist">
                {built.preview.lifts.map((l) => (
                  <li key={l.name}>
                    <span className="grow small">{l.name}{l.existing && l.existing.toLowerCase() !== l.name.toLowerCase() ? <span className="muted"> → {l.existing}</span> : null}</span>
                    {l.existing ? <span className="muted small">yours</span> : <span className="badge">new</span>}
                  </li>
                ))}
              </ul>
              <p className="muted small" style={{ margin: 0 }}>Matched to your lifts by name. Anything else is added as a new lift with the name you wrote.</p>
            </div>
          )}

          {program && (
            <div className="card stack">
              <h2 style={{ margin: 0 }}>{program.source === "stated" ? "Your program, as written" : "Your split, rebuilt from these workouts"}</h2>
              <div className="muted small">{program.mode === "weekly" ? "Weekly (days on fixed weekdays)" : "Rotation (next day after each workout)"}{program.source === "inferred" ? " · usual sets and the reps you actually did, from each day's last 4 workouts" : ""}</div>
              {program.days.map((d, i) => (
                <div key={i} className="stack" style={{ gap: 4 }}>
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <input style={{ flex: 1, minWidth: 0, fontWeight: 650 }} value={dayNames[i] ?? d.name} onChange={(e) => setDayNames({ ...dayNames, [i]: e.target.value })} aria-label={`Name for day ${i + 1}`} maxLength={40} />
                    {d.weekday != null && program.mode === "weekly" && <span className="pill">{DOW[d.weekday]}</span>}
                  </div>
                  <div className="muted small">
                    {d.exercises.map((x) => `${x.name} ${x.sets}×${x.reps}${x.stated === false ? "*" : ""}${x.weight ? ` @ ${x.weight} ${x.unit ?? profile.unit}` : ""}${x.note ? ` (${x.note})` : ""}`).join(" · ")}
                  </div>
                </div>
              ))}
              {program.days.some((d) => d.exercises.some((x) => x.stated === false)) && (
                <p className="muted small" style={{ margin: 0 }}>* Sets and reps weren&apos;t in your file, so these use {cfg.import.defaultSets} × {cfg.import.defaultReps}. Change them on the Split page any time. Weights listed become each lift&apos;s starting weight until you log it.</p>
              )}
            </div>
          )}

          {data.goals.length > 0 && (
            <div className="card stack">
              <h2 style={{ margin: 0 }}>Goals</h2>
              {data.goals.map((g, i) => <div key={i} className="small">{describeAction(g, profile.unit)}</div>)}
            </div>
          )}

          {data.skipped.length > 0 && (
            <details className="card">
              <summary className="small">{data.skipped.length} line{data.skipped.length === 1 ? "" : "s"} not imported</summary>
              <pre className="code" style={{ whiteSpace: "pre-wrap" }}>{data.skipped.slice(0, 100).join("\n")}</pre>
            </details>
          )}

          <div className="card stack">
            {check("history", `Add the ${data.sessions.length} workouts to my history (PRs and charts update)`, !data.sessions.length)}
            {check("program", "Save the split", !program)}
            {check("activate", "…and make it my active split", !program || !choices.program)}
            {check("goals", "Add the goals", !data.goals.length)}
            <button className="btn primary big" disabled={!!busy} onClick={doImport}>Import</button>
            {busy && <span className="muted small">{busy}</span>}
            {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}
            <p className="muted small" style={{ margin: 0 }}>Importing the same workouts twice is safe: ones already here (same date and time) are skipped.</p>
          </div>
        </>
      )}
      {toast.node}
    </div>
  );
}
