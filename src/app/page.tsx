"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Dashboard } from "@/components/Dashboard";
import { RestTimer, type TimerState } from "@/components/RestTimer";
import { Stepper } from "@/components/Stepper";
import { useToast } from "@/components/UndoToast";
import { matchExercise } from "@/lib/domain/match";
import { platesPerSide } from "@/lib/domain/plates";
import { prefillFor, type Prefill } from "@/lib/domain/progression";
import { prsForSet, replayPRs } from "@/lib/domain/prs";
import { parseShorthand } from "@/lib/domain/shorthand";
import { nextPosition, type Today } from "@/lib/domain/split";
import type { Exercise, PREvent, PRType, Session, SetEntry, Split, SplitDay } from "@/lib/domain/types";
import { formatWeight, fromKg, roundTo, toKg } from "@/lib/domain/units";
import { lastSessionSets, logSet, rebuildPRs, stepKg } from "@/lib/service";

const PR_LABEL: Record<PRType, string> = { weight: "Heaviest", reps_at_weight: "Rep PR", e1rm: "e1RM PR", session_volume: "Volume PR" };

interface Draft {
  weight: number; // display units
  reps: number;
  isWarmup: boolean;
  rpe: string;
  note: string;
}

export default function TodayPage() {
  const { cfg, store, profile, version, refresh, now } = useApp();
  const unit = profile.unit;
  const toast = useToast(cfg.logging.undoToastMs);

  const [today, setToday] = useState<Today | null>(null);
  const [split, setSplit] = useState<Split | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [history, setHistory] = useState<Map<string, SetEntry[]>>(new Map());
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [dayOverride, setDayOverride] = useState<string | null>(null);
  const [extraExercises, setExtraExercises] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [showPlates, setShowPlates] = useState(false);
  const [shorthand, setShorthand] = useState("");
  const [shorthandErr, setShorthandErr] = useState<string | null>(null);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [busy, setBusy] = useState(false);
  const workoutRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [t, splits, open, exList, sessions] = await Promise.all([
      store.getToday(now()), store.listSplits(), store.getOpenSession(), store.listExercises(), store.listSessions(),
    ]);
    const exMap = new Map(exList.map((e) => [e.id, e]));
    const active = splits.find((s) => s.isActive) ?? null;
    const sets = await store.listSets();
    const hist = new Map<string, SetEntry[]>();
    for (const s of sets) hist.set(s.exerciseId, [...(hist.get(s.exerciseId) ?? []), s]);
    setToday(t);
    setSplit(active);
    setSession(open);
    setExercises(exMap);
    setHistory(hist);
    setAllSessions(sessions);
  }, [store, now]);

  useEffect(() => {
    void load();
  }, [load, version]);

  // Which day are we showing? An open session wins (e.g. started from Discord), then a manual swap, then "today".
  const day: SplitDay | null = useMemo(() => {
    if (!split) return null;
    const id = session?.splitDayId ?? dayOverride;
    if (id) return split.days.find((d) => d.id === id) ?? null;
    return today?.kind === "day" ? today.day : null;
  }, [split, session, dayOverride, today]);

  const sessionSets = useMemo(() => {
    if (!session) return new Map<string, SetEntry[]>();
    const m = new Map<string, SetEntry[]>();
    for (const sets of history.values()) for (const s of sets) if (s.sessionId === session.id) m.set(s.exerciseId, [...(m.get(s.exerciseId) ?? []), s]);
    return m;
  }, [history, session]);

  const plan = useMemo(() => {
    const items = (day?.exercises ?? []).slice().sort((a, b) => a.order - b.order).map((x) => ({ ...x }));
    const ids = new Set(items.map((x) => x.exerciseId));
    for (const id of [...extraExercises, ...sessionSets.keys()]) {
      if (!ids.has(id)) {
        items.push({ exerciseId: id, order: items.length, targetSets: cfg.logging.defaultTargetSets, repRange: cfg.logging.defaultRepRange });
        ids.add(id);
      }
    }
    return items;
  }, [day, extraExercises, sessionSets, cfg.logging]);

  const prEvents = useMemo(() => {
    const m = new Map<string, PREvent[]>();
    for (const [id, sets] of history) m.set(id, replayPRs(sets, allSessions, cfg));
    return m;
  }, [history, allSessions, cfg]);

  // Focus: keep the current one, else the first exercise with sets left.
  useEffect(() => {
    if (focusId && plan.some((p) => p.exerciseId === focusId)) return;
    const next = plan.find((p) => (sessionSets.get(p.exerciseId)?.filter((s) => !s.isWarmup).length ?? 0) < p.targetSets) ?? plan[0];
    setFocusId(next?.exerciseId ?? null);
  }, [plan, focusId, sessionSets]);

  const focusPlan = plan.find((p) => p.exerciseId === focusId) ?? null;
  const focusEx = focusId ? exercises.get(focusId) : undefined;
  const focusWorkingCount = focusId ? (sessionSets.get(focusId)?.filter((s) => !s.isWarmup).length ?? 0) : 0;
  const step = stepKg(focusEx, unit, cfg);
  const stepDisplay = Number(fromKg(step, unit).toFixed(3));

  const prefill: Prefill | null = useMemo(() => {
    if (!focusId || !focusPlan) return null;
    const last = lastSessionSets(history.get(focusId) ?? [], session?.id ?? null);
    const pf = prefillFor(focusWorkingCount, last, focusPlan.repRange, focusEx?.category ?? "other", unit, cfg, step);
    // Within a session, repeat this session's previous set rather than last time's.
    const cur = sessionSets.get(focusId)?.filter((s) => !s.isWarmup) ?? [];
    if (pf && cur.length && pf.reason !== "progression") return { weightKg: cur[cur.length - 1].weightKg, reps: pf.reps, reason: pf.reason };
    if (pf && cur.length && pf.reason === "progression") return { ...pf, weightKg: cur[cur.length - 1].weightKg };
    return pf;
  }, [focusId, focusPlan, history, session, focusWorkingCount, focusEx, unit, cfg, step, sessionSets]);

  // Reset the draft whenever the focused set changes.
  useEffect(() => {
    if (!prefill) return setDraft(null);
    // No history: start a barbell lift at the empty bar.
    const startKg = prefill.reason === "plan" && prefill.weightKg === 0 && focusEx?.equipment === "barbell" ? toKg(cfg.plates.bar[unit], unit) : prefill.weightKg;
    setDraft({ weight: roundTo(fromKg(startKg, unit), stepDisplay), reps: prefill.reps, isWarmup: false, rpe: "", note: "" });
    setShowMore(false);
  }, [prefill, unit, stepDisplay, focusEx, cfg.plates.bar]);

  // Let CSS know how tall the dock is so the toast and page padding clear it.
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dockRef.current;
    const set = () => document.documentElement.style.setProperty("--dock-h", `${el?.offsetHeight ?? 0}px`);
    set();
    if (!el) return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty("--dock-h", "0px");
    };
  });

  const ensureSession = async (): Promise<Session> => {
    if (session) return session;
    const s = await store.startSession(day?.id ?? null, now());
    setSession(s);
    return s;
  };

  const startRest = (ex: Exercise | undefined) => {
    if (!cfg.features.restTimer || !cfg.restTimer.enabled || !cfg.restTimer.autoStart) return;
    const secs = (ex && cfg.restTimer.byCategory[ex.category]) ?? cfg.restTimer.defaultSeconds;
    if (secs > 0) setTimer({ endsAt: Date.now() + secs * 1000, total: secs });
  };

  const advanceFocusIfDone = (exerciseId: string, newWorkingCount: number) => {
    const p = plan.find((x) => x.exerciseId === exerciseId);
    if (!p || newWorkingCount < p.targetSets) return;
    const next = plan.find((x) => x.exerciseId !== exerciseId && (sessionSets.get(x.exerciseId)?.filter((s) => !s.isWarmup).length ?? 0) < x.targetSets);
    if (next) setFocusId(next.exerciseId);
  };

  const saveDraft = async () => {
    if (!draft || !focusId || busy) return;
    setBusy(true);
    try {
      const s = await ensureSession();
      const idx = sessionSets.get(focusId)?.length ?? 0;
      const rpe = draft.rpe.trim() ? Number(draft.rpe) : null;
      const { set, prs } = await logSet(store, cfg, {
        sessionId: s.id, exerciseId: focusId, setIndex: idx, weightKg: toKg(draft.weight, unit), reps: draft.reps,
        rpe: Number.isFinite(rpe) ? rpe : null, isWarmup: draft.isWarmup, note: draft.note.trim() || null, createdAt: now().toISOString(),
      });
      const prText = prs.length ? ` · 🏆 ${prs.map((p) => PR_LABEL[p]).join(", ")}` : "";
      if (prs.length) void store.announcePRs(set.id);
      if (cfg.features.undoToast) {
        toast.show({
          text: `${draft.isWarmup ? "Warm-up" : "Set"} saved · ${Number(draft.weight.toFixed(2))} × ${draft.reps}${prText}`,
          undo: async () => {
            await store.deleteSet(set.id);
            await rebuildPRs(store, cfg, set.exerciseId);
            refresh();
          },
        });
      }
      if (!draft.isWarmup) {
        startRest(focusEx);
        advanceFocusIfDone(focusId, focusWorkingCount + 1);
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const deleteSet = async (s: SetEntry) => {
    await store.deleteSet(s.id);
    await rebuildPRs(store, cfg, s.exerciseId);
    toast.show({
      text: "Set deleted",
      undo: async () => {
        await store.restoreSet(s);
        await rebuildPRs(store, cfg, s.exerciseId);
        refresh();
      },
    });
    await load();
  };

  const submitShorthand = async () => {
    const parsed = parseShorthand(shorthand);
    if (!parsed) return setShorthandErr('Try "185x5x3", "185 5,5,4" or "185x5, 195x3"');
    let exId = focusId;
    if (parsed.exercise) {
      const match = matchExercise(parsed.exercise, [...exercises.values()], cfg.logging.aliases);
      if (!match) return setShorthandErr(`No exercise matches "${parsed.exercise}"`);
      exId = match.id;
      if (!plan.some((p) => p.exerciseId === exId)) setExtraExercises((x) => [...x, match.id]);
    }
    if (!exId) return setShorthandErr("Pick an exercise first");
    setShorthandErr(null);
    const s = await ensureSession();
    let idx = sessionSets.get(exId)?.length ?? 0;
    const allPrs = new Set<PRType>();
    const created: SetEntry[] = [];
    for (const p of parsed.sets) {
      const { set, prs } = await logSet(store, cfg, {
        sessionId: s.id, exerciseId: exId, setIndex: idx++, weightKg: toKg(p.weight, p.unit ?? unit), reps: p.reps,
        rpe: p.rpe, isWarmup: false, note: null, createdAt: new Date(now().getTime() + idx).toISOString(),
      });
      created.push(set);
      prs.forEach((x) => allPrs.add(x));
      if (prs.length) void store.announcePRs(set.id);
    }
    setShorthand("");
    toast.show({
      text: `Logged ${created.length} set${created.length > 1 ? "s" : ""}${allPrs.size ? ` · 🏆 ${[...allPrs].map((p) => PR_LABEL[p]).join(", ")}` : ""}`,
      undo: async () => {
        for (const c of created) await store.deleteSet(c.id);
        await rebuildPRs(store, cfg, exId!);
        refresh();
      },
    });
    startRest(exercises.get(exId));
    await load();
  };

  const finish = async () => {
    if (!session) return;
    const prevPos = (await store.getSplitState())?.nextPosition ?? null;
    await store.finishSession(session.id, now());
    for (const id of sessionSets.keys()) await rebuildPRs(store, cfg, id);
    setTimer(null);
    setDayOverride(null);
    setExtraExercises([]);
    const sid = session.id;
    toast.show({ text: "Workout finished. Split advanced.", undo: async () => { await store.reopenSession(sid, prevPos); refresh(); } });
    await load();
  };

  const skip = async () => {
    if (!split || !day) return;
    const prev = (await store.getSplitState())?.nextPosition ?? day.position;
    await store.setNextPosition(nextPosition(split, day.position));
    setDayOverride(null);
    toast.show({ text: `Skipped ${day.name}`, undo: async () => { await store.setNextPosition(prev); refresh(); } });
    await load();
  };

  const swapTo = async (dayId: string) => {
    if (!split || !dayId) return;
    const target = split.days.find((d) => d.id === dayId);
    if (!target) return;
    if (split.mode === "rotation") {
      await store.setNextPosition(target.position);
      setDayOverride(null);
      await load();
    } else {
      setDayOverride(dayId);
    }
  };

  const plates = draft && cfg.features.plateCalculator && showPlates ? platesPerSide(draft.weight, cfg.plates.bar[unit], cfg.plates.available[unit]) : null;
  const restDay = !day && today?.kind === "rest";
  const hour = now().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="page stack">
      <header>
        <div className="hello">{greeting}, {profile.displayName}</div>
        <h1>{day ? `Ready for ${day.name}?` : restDay ? "Rest day. Recover well." : today?.kind === "no-split" ? "Let's set up your split" : "Ready to train?"}</h1>
      </header>

      <Dashboard today={today} onFocusWorkout={() => workoutRef.current?.scrollIntoView({ behavior: "smooth" })} />

      <div ref={workoutRef} className="stack">
        {split && split.days.length > 0 && (
          <div className="row">
            {!session && split.mode === "rotation" && day && <button className="btn sm" onClick={skip}>Skip {day.name}</button>}
            {!session && (
              <select aria-label="Swap day" value="" onChange={(e) => swapTo(e.target.value)}>
                <option value="">{restDay ? "Train anyway…" : "Swap day…"}</option>
                {[...split.days].sort((a, b) => a.position - b.position).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            <select aria-label="Add exercise" value="" onChange={(e) => e.target.value && (setExtraExercises((x) => [...x, e.target.value]), setFocusId(e.target.value))}>
              <option value="">+ Add exercise</option>
              {[...exercises.values()].filter((e) => !plan.some((p) => p.exerciseId === e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            {session && <span className="pill good">In progress{session.source === "discord" ? " (from Discord)" : ""}</span>}
          </div>
        )}

        {today?.kind === "no-split" && !day && (
          <div className="card">No active split. <a href="/split">Create one</a>, or add an exercise above to log freestyle.</div>
        )}

        {plan.map((p) => {
          const ex = exercises.get(p.exerciseId);
          const done = sessionSets.get(p.exerciseId) ?? [];
          const working = done.filter((s) => !s.isWarmup).length;
          const events = prEvents.get(p.exerciseId) ?? [];
          const last = lastSessionSets(history.get(p.exerciseId) ?? [], session?.id ?? null).filter((s) => !s.isWarmup);
          return (
            <div key={p.exerciseId} className={`card ${p.exerciseId === focusId ? "focused" : ""}`} onClick={() => setFocusId(p.exerciseId)}>
              <div className="spread">
                <div>
                  <strong>{ex?.name ?? "Unknown exercise"}</strong>
                  <div className="muted small">
                    {working}/{p.targetSets} sets · {p.repRange} reps
                    {last.length > 0 && ` · last: ${last.map((s) => `${Number(fromKg(s.weightKg, unit).toFixed(1))}×${s.reps}`).join(", ")}`}
                  </div>
                </div>
                {working >= p.targetSets && <span className="pill good">Done</span>}
              </div>
              {done.length > 0 && (
                <ul className="setlist">
                  {done.map((s, i) => (
                    <li key={s.id}>
                      <span className="idx">{s.isWarmup ? "W" : i + 1}</span>
                      <span className="grow">
                        {formatWeight(s.weightKg, unit, cfg.units.displayDecimals)} × {s.reps}
                        {s.rpe != null && <span className="muted small"> @{s.rpe}</span>}
                        {s.note && <span className="muted small"> · {s.note}</span>}
                      </span>
                      {prsForSet(events, s.id).map((t) => <span key={t} className="badge">{PR_LABEL[t]}</span>)}
                      <button className="btn sm ghost" aria-label="Delete set" onClick={(e) => { e.stopPropagation(); void deleteSet(s); }}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {session && (
          <button className="btn primary big" onClick={finish}>Finish workout</button>
        )}
      </div>

      {focusId && draft && (
        <div className="dock" ref={dockRef}>
          <div className="dock-inner">
            {timer && <RestTimer timer={timer} onChange={setTimer} />}
            <div className="spread">
              <strong>{focusEx?.name} · {draft.isWarmup ? "warm-up" : `set ${focusWorkingCount + 1}`}</strong>
              {cfg.features.progressionHints && prefill && (
                <span className="muted small">
                  {prefill.reason === "progression" ? `↑ +${cfg.progression.jump[unit][focusEx?.category ?? "other"]} ${unit}, all reps hit` : prefill.reason === "hold-missed" ? "Hold weight: missed reps last time" : prefill.reason === "last-time" ? "Same as last time" : "No history yet"}
                </span>
              )}
            </div>
            <div className="steppers">
              <Stepper label={unit} value={draft.weight} step={stepDisplay} decimals={2} longPressMs={cfg.logging.longPressMs} onChange={(v) => setDraft({ ...draft, weight: v })} />
              <Stepper label="reps" value={draft.reps} step={cfg.logging.repStep} min={0} decimals={0} longPressMs={cfg.logging.longPressMs} onChange={(v) => setDraft({ ...draft, reps: Math.round(v) })} />
            </div>
            {plates && (
              <div className="muted small">
                Per side: {plates.plates.length ? plates.plates.join(" + ") : "empty bar"} {plates.remainder > 0 && `(${plates.remainder} ${unit} can't be loaded)`}
              </div>
            )}
            {showMore && (
              <div className="row">
                <label className="row small"><input type="checkbox" checked={draft.isWarmup} onChange={(e) => setDraft({ ...draft, isWarmup: e.target.checked })} /> Warm-up</label>
                <input style={{ width: 80 }} inputMode="decimal" placeholder="RPE" value={draft.rpe} onChange={(e) => setDraft({ ...draft, rpe: e.target.value })} />
                <input style={{ flex: 1, minWidth: 120 }} placeholder="Note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              </div>
            )}
            {showMore && cfg.features.shorthandBox && (
              <form className="row" onSubmit={(e) => { e.preventDefault(); void submitShorthand(); }}>
                <input style={{ flex: 1 }} placeholder='Quick: 185x5x3 · 185 5,5,4 · bench 185x5' value={shorthand} onChange={(e) => setShorthand(e.target.value)} aria-label="Shorthand sets" />
                <button className="btn" type="submit">Log</button>
                {shorthandErr && <div className="small" style={{ color: "var(--bad)", width: "100%" }}>{shorthandErr}</div>}
              </form>
            )}
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <button className="btn" onClick={() => setShowMore(!showMore)} aria-expanded={showMore}>{showMore ? "Less" : "More"}</button>
              {cfg.features.plateCalculator && <button className={`btn ${showPlates ? "active" : ""}`} onClick={() => setShowPlates(!showPlates)}>Plates</button>}
              <button className="btn primary big" style={{ flex: 1 }} disabled={busy} onClick={saveDraft}>Save set</button>
            </div>
          </div>
        </div>
      )}
      {toast.node}
    </div>
  );
}
