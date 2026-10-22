"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { applyAction, describeAction } from "@/lib/ai/actions";
import type { Exercise } from "@/lib/domain/types";
import { buildImport, type ImportChoices } from "@/lib/import/build";
import { rankLifts } from "@/lib/domain/synonyms";
import { inferProgram } from "@/lib/import/infer";
import { applyAnswer, questionsFor, type ImportQuestion } from "@/lib/import/questions";
import { IMPORT_DRAFT_KEY, readAnything } from "@/lib/import/read";
import type { ImportedData, ImportedProgram, ProgramExercise } from "@/lib/import/types";
import { supabaseOf } from "@/lib/store";
import { uid } from "@/lib/store/local";
import { shrinkPhoto } from "@/lib/media/resize";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EXAMPLE = `Paste anything: notes, a plan, cells copied from a spreadsheet, or an app export.

Oct 14 - Push
Bench press 185x5x3
OHP 115 8,8,7

Mon  Chest  Flat Bench  145lbs
Tue  Back   Lat Pull Down  95lbs`;

type Edits = Record<string, string>; // "d:e:field" → value, "d:name" → value
type Memory = { mine: Record<string, string>; popular: Record<string, { value: string; users: number }> };

/** Program after answers, then the user's own edits, then removed rows. */
function finalProgram(base: ImportedProgram | null, questions: ImportQuestion[], answers: Record<string, string>, edits: Edits, removed: Set<string>): ImportedProgram | null {
  if (!base) return null;
  let p = base;
  for (const q of questions) if (answers[q.key]) p = applyAnswer(p, q.key, answers[q.key]);
  return {
    ...p,
    days: p.days.map((d, di) => ({
      ...d,
      name: edits[`${di}:name`]?.trim() || d.name,
      exercises: d.exercises.flatMap((x, ei): ProgramExercise[] => {
        if (removed.has(`${di}:${ei}`)) return [];
        const e = (f: string) => edits[`${di}:${ei}:${f}`];
        const sets = Number(e("sets"));
        const reps = e("reps")?.replace(/\s/g, "");
        const w = e("weight");
        return [{
          ...x,
          srcIndex: ei,
          name: e("name")?.trim() || x.name,
          ...(sets >= 1 && sets <= 10 ? { sets, setsStated: true } : {}),
          ...(reps && /^\d{1,3}(-\d{1,3})?$/.test(reps) ? { reps, stated: true } : {}),
          ...(w !== undefined ? { weight: Number(w) > 0 ? Number(w) : null } : {}),
        }];
      }),
    })),
  };
}

/**
 * Import: paste or upload anything. The app's own readers go first (free,
 * exact); if they can't make sense of it, James reads it. Anything unclear
 * becomes a question (remembered for next time), everything is editable,
 * and nothing is saved until Import.
 */
export default function ImportPage() {
  const { cfg, store, profile, now, refresh } = useApp();
  const sb = supabaseOf(store);
  const bot = cfg.brand.botName;
  const defaults = { sets: cfg.import.defaultSets, reps: cfg.import.defaultReps };
  const [text, setText] = useState("");
  const [data, setData] = useState<ImportedData | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [choices, setChoices] = useState<ImportChoices>({ history: true, program: true, activate: false, goals: true });
  const [done, setDone] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [memory, setMemory] = useState<Memory>({ mine: {}, popular: {} });
  const [edits, setEdits] = useState<Edits>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  /** Photos/screenshots to read (shrunk data URLs). Beta: James reads them with the image model. */
  const [photos, setPhotos] = useState<string[]>([]);
  const maxPhotos = 2;

  const base = useMemo(() => (data ? data.program ?? inferProgram(data.sessions) : null), [data]);
  const questions = useMemo(() => (data ? questionsFor(data, base) : []), [data, base]);
  const program = useMemo(() => finalProgram(base, questions, answers, edits, removed), [base, questions, answers, edits, removed]);
  /** "Same as" picks for lifts that didn't match: imported name (lowercase) → your lift. */
  const [sameAs, setSameAs] = useState<Record<string, string>>({});
  const built = useMemo(() => (data ? buildImport(data, program, exercises, choices, cfg, uid, sameAs) : null), [data, program, exercises, choices, cfg, sameAs]);
  const unanswered = questions.filter((q) => !answers[q.key]);

  const show = async (d: ImportedData, how: string | null) => {
    setExercises(await store.listExercises());
    const p = d.program ?? inferProgram(d.sessions);
    const qs = questionsFor(d, p);
    const mem = await store.importMemory(qs.map((q) => q.key)).catch(() => ({ mine: {}, popular: {} }));
    setMemory(mem);
    setAnswers(mem.mine); // your earlier answers apply straight away (changeable)
    setEdits({});
    setSameAs({});
    setRemoved(new Set());
    setData(d);
    setDone(null);
    setNote(how);
    // A plan with no history is almost always meant to become the split you follow.
    setChoices({ history: d.sessions.length > 0, program: true, activate: !d.sessions.length && !!d.program, goals: d.goals.length > 0 });
  };

  const askJames = async (input: string, why: string | null, images: string[] = []) => {
    if (!sb) return setErr("I couldn't read that format. Try notes like the example, a copied spreadsheet, or a Strong/Hevy export.");
    setErr(null);
    setBusy(`${why ? `${why} ` : ""}${bot} is reading it…`);
    try {
      const { data: s } = await sb.sb.auth.getSession();
      const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` }, body: JSON.stringify({ text: input, images }) });
      const json = (await res.json()) as { ok: boolean; data?: ImportedData; message?: string };
      if (json.ok && json.data) {
        await show(json.data, images.length
          ? `Read from your photo by ${bot} (test feature, uses one of today's ${bot} requests). Check every number: handwriting and screenshots are easy to misread.`
          : `Read by ${bot} (uses one of today's ${bot} requests). Check it below: he can misread things.`);
      }
      else setErr(json.message ?? "Something went wrong.");
    } catch {
      setErr(navigator.onLine ? "Couldn't reach the server. Try again." : "You're offline.");
    } finally {
      setBusy(null);
    }
  };

  const read = async (input = text) => {
    setErr(null);
    if (photos.length) return askJames(input, null, photos);
    const r = readAnything(input, profile.unit, now(), defaults);
    if (!r.needsJames) return show(r.data, null);
    await askJames(input, "This isn't a format I know, so");
  };

  // Notes handed over from the chat ("Import these").
  useEffect(() => {
    let draft: string | null = null;
    try {
      draft = sessionStorage.getItem(IMPORT_DRAFT_KEY);
      sessionStorage.removeItem(IMPORT_DRAFT_KEY);
    } catch {
      /* ignore */
    }
    if (draft) {
      setText(draft);
      void read(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (choices.goals && data.goals.length) {
        let ok = 0;
        for (const g of data.goals) {
          try {
            await applyAction(g, { store, cfg, profile, now, newId: uid, patchConfig: () => {} });
            ok++;
          } catch {
            /* a goal for a lift that wasn't found */
          }
        }
        parts.push(`${ok} goal${ok === 1 ? "" : "s"}`);
      }
      // Teach synonyms: your "same as" picks, and names that are still new (for the owner's review).
      for (const [name, id] of Object.entries(sameAs)) void store.voteAlias(name, id);
      for (const l of built.preview.lifts) if (!l.existing) void store.recordNameMiss(l.name);
      // Remember the answers for next time (and, counted anonymously, as hints for others).
      if (Object.keys(answers).length) await store.rememberImportAnswers(answers);
      setDone(parts.join(" · ") || "Imported");
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
    if (!f) return;
    const t = await f.text();
    setText(t);
    await read(t);
  };

  const onPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    setErr(null);
    try {
      const shrunk = await Promise.all(files.slice(0, maxPhotos - photos.length).map((f) => shrinkPhoto(f)));
      setPhotos((p) => [...p, ...shrunk].slice(0, maxPhotos));
      if (files.length > maxPhotos - photos.length) setErr(`Up to ${maxPhotos} photos at a time.`);
    } catch (err) {
      setErr(err instanceof Error ? err.message : String(err));
    }
  };

  const check = (k: keyof ImportChoices, label: string, disabled = false) => (
    <label className="row small" style={{ opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" disabled={disabled} checked={choices[k] && !disabled} onChange={(e) => setChoices({ ...choices, [k]: e.target.checked })} /> {label}
    </label>
  );
  const edit = (k: string, v: string) => setEdits((x) => ({ ...x, [k]: v }));

  return (
    <div className="page stack">
      <Link href="/settings" className="small" style={{ fontWeight: 600 }}>‹ Settings</Link>
      <h1>Import</h1>

      {done && (
        <div className="card stack">
          <strong>✓ {done}</strong>
          <div className="row"><Link className="btn" href="/split">See split</Link><Link className="btn" href="/progress">See progress</Link></div>
        </div>
      )}

      {!data && (
        <div className="card stack">
          <p className="muted small" style={{ margin: 0 }}>
            Your old workouts or your split, in whatever form you have them: notes, a plan, cells copied from Google Sheets or Excel, or an export from another app.
            If I can&apos;t read it myself, {sb ? `${bot} will` : "I'll say so"}. You&apos;ll check everything, and answer anything unclear, before it&apos;s saved.
          </p>
          <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} aria-label="Workouts to import" spellCheck={false} />
          {photos.length > 0 && (
            <div className="row" style={{ gap: 8 }}>
              {photos.map((src, i) => (
                <div key={i} className="photo-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Photo ${i + 1}`} />
                  <button className="btn sm" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="row">
            <button className="btn primary" disabled={(!text.trim() && !photos.length) || !!busy} onClick={() => read()}>Read it</button>
            <label className="btn">Upload a file<input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values" hidden onChange={onFile} /></label>
            {sb && photos.length < maxPhotos && (
              <label className="btn">📷 Photo or screenshot<input type="file" accept="image/*" multiple hidden onChange={onPhotos} /></label>
            )}
          </div>
          {sb && <span className="muted small">Photos are a test feature: {bot} reads them, and you check every number before saving.</span>}
          {busy && <span className="muted small">{busy}</span>}
          {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}
        </div>
      )}

      {data && built && (
        <>
          <div className="card stack">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Check it</h2>
              <button className="btn sm ghost" onClick={() => setData(null)}>Start over</button>
            </div>
            <div className="small">
              {!data.sessions.length && data.program ? "A plan (no dated workouts, so nothing is added to your history)." : data.sessions.length ? <><strong>{data.sessions.length}</strong> workouts, <strong>{data.sessions.reduce((a, s) => a + s.sets.length, 0)}</strong> sets, {data.sessions[0].date} → {data.sessions[data.sessions.length - 1].date}</> : "No dated workouts."}
            </div>
            {note && <div className="muted small">{note}</div>}
            {data.format !== "ai" && sb && (
              <button className="btn sm" style={{ justifySelf: "start" }} disabled={!!busy} onClick={() => askJames(text, null)}>Not right? Have {bot} read it instead</button>
            )}
            {busy && <span className="muted small">{busy}</span>}
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

          {questions.length > 0 && (
            <div className="card stack" id="questions">
              <h2 style={{ margin: 0 }}>{unanswered.length ? `${unanswered.length} quick question${unanswered.length === 1 ? "" : "s"}` : "Your answers"}</h2>
              {questions.map((q) => {
                const a = answers[q.key];
                const fromMemory = a !== undefined && memory.mine[q.key] === a;
                const pop = memory.popular[q.key];
                const custom = q.allowText && a !== undefined && !q.options.some((o) => o.value === a);
                return (
                  <div key={q.key} className="stack" style={{ gap: 6 }}>
                    <strong className="small">{q.prompt}</strong>
                    <div className="row" style={{ gap: 6 }}>
                      {q.options.map((o) => (
                        <button key={o.value} className={`chip ${a === o.value ? "on" : ""}`} aria-pressed={a === o.value} onClick={() => setAnswers({ ...answers, [q.key]: o.value })}>{o.label}</button>
                      ))}
                      {q.allowText && (
                        <input
                          style={{ width: 140 }}
                          placeholder="Something else…"
                          defaultValue={custom ? a : ""}
                          maxLength={40}
                          onBlur={(e) => e.target.value.trim() && setAnswers({ ...answers, [q.key]: e.target.value.trim() })}
                          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                          aria-label="Your own answer"
                        />
                      )}
                    </div>
                    {fromMemory && <span className="muted small">Your answer from last time.</span>}
                    {!a && pop && <span className="muted small">Most people ({pop.users}) answered “{q.options.find((o) => o.value === pop.value)?.label ?? pop.value}”.</span>}
                  </div>
                );
              })}
              <p className="muted small" style={{ margin: 0 }}>I&apos;ll remember your answers for your next import. Answers are also counted anonymously to suggest common meanings to others (only once 3+ people give the same one).</p>
            </div>
          )}

          {program && (
            <div className="card stack">
              <h2 style={{ margin: 0 }}>{program.source === "stated" ? "Your split" : "Your split, rebuilt from these workouts"}</h2>
              <div className="muted small">
                {program.mode === "weekly" ? "Weekly (days on fixed weekdays)" : "Rotation (next day after each workout)"}
                {program.source === "inferred" ? " · usual sets and the reps you actually did, from each day's last 4 workouts" : ""}. Tap a day to edit it.
              </div>
              {program.days.map((d, di) => (
                <details key={di} className="import-day">
                  <summary>
                    <strong>{d.name}</strong>
                    {d.weekday != null && program.mode === "weekly" && <span className="pill">{DOW[d.weekday]}</span>}
                    <span className="muted small">{d.exercises.length} lifts</span>
                    <div className="muted small" style={{ flexBasis: "100%" }}>
                      {d.exercises.map((x) => `${x.name} ${x.sets}×${x.reps}${x.weight ? ` @ ${x.weight}` : ""}${x.note ? ` (${x.note})` : ""}`).join(" · ")}
                    </div>
                  </summary>
                  <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                    <label className="field">Day name<input value={edits[`${di}:name`] ?? d.name} maxLength={40} onChange={(e) => edit(`${di}:name`, e.target.value)} /></label>
                    {d.exercises.map((x) => {
                      const ei = x.srcIndex ?? 0;
                      const k = (f: string) => `${di}:${ei}:${f}`;
                      return (
                        <div key={k("row")} className="import-ex">
                          <input className="split-ex-name" value={edits[k("name")] ?? x.name} maxLength={60} onChange={(e) => edit(k("name"), e.target.value)} aria-label="Lift name" />
                          <div className="split-ex-row">
                            <label className="split-ex-field">Sets<input type="number" min={1} max={10} value={edits[k("sets")] ?? x.sets} onChange={(e) => edit(k("sets"), e.target.value)} /></label>
                            <label className="split-ex-field">Reps<input value={edits[k("reps")] ?? x.reps} onChange={(e) => edit(k("reps"), e.target.value)} /></label>
                            <label className="split-ex-field">Start<input inputMode="decimal" placeholder={profile.unit} value={edits[k("weight")] ?? (x.weight ?? "")} onChange={(e) => edit(k("weight"), e.target.value.replace(/[^\d.]/g, ""))} /></label>
                            <span style={{ flex: 1 }} />
                            <button className="btn sm ghost" aria-label={`Remove ${x.name}`} onClick={() => setRemoved((r) => new Set(r).add(`${di}:${ei}`))}>✕</button>
                          </div>
                          {x.note && <span className="muted small">{x.note}</span>}
                        </div>
                      );
                    })}
                  </div>
                </details>
              ))}
              {program.days.some((d) => d.exercises.some((x) => x.stated === false)) && !answers.setsreps && (
                <p className="muted small" style={{ margin: 0 }}>Sets and reps your plan didn&apos;t list use {defaults.sets} × {defaults.reps} until you pick above or edit a day.</p>
              )}
            </div>
          )}

          {built.preview.lifts.length > 0 && (
            <details className="card">
              <summary className="small"><strong>{built.preview.lifts.length} lifts</strong> · {built.preview.lifts.filter((l) => !l.existing).length} new to your account</summary>
              <ul className="setlist" style={{ marginTop: 8 }}>
                {built.preview.lifts.map((l) => (
                  <li key={l.name}>
                    <span className="grow small">{l.name}{l.existing && l.existing.toLowerCase() !== l.name.toLowerCase() ? <span className="muted"> → {l.existing}</span> : null}</span>
                    {(!l.existing || sameAs[l.name.trim().toLowerCase()]) ? (
                      <select
                        className="small"
                        aria-label={`What is ${l.name}?`}
                        value={sameAs[l.name.trim().toLowerCase()] ?? ""}
                        onChange={(e) => setSameAs((m) => {
                          const k = l.name.trim().toLowerCase();
                          const { [k]: _, ...rest } = m;
                          return e.target.value ? { ...rest, [k]: e.target.value } : rest;
                        })}
                      >
                        <option value="">New lift</option>
                        <optgroup label="Same as…">
                          {rankLifts(l.name, exercises, [], 8).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </optgroup>
                      </select>
                    ) : <span className="muted small">yours</span>}
                  </li>
                ))}
              </ul>
            </details>
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
            {unanswered.length > 0 && <span className="small" style={{ color: "var(--warn, var(--muted))" }}>{unanswered.length} question{unanswered.length === 1 ? "" : "s"} unanswered: <a href="#questions">answer</a> or import as shown.</span>}
            <button className="btn primary big" disabled={!!busy} onClick={doImport}>Import</button>
            {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}
            <p className="muted small" style={{ margin: 0 }}>Importing the same workouts twice is safe: ones already here (same date and time) are skipped.</p>
          </div>
        </>
      )}
    </div>
  );
}
