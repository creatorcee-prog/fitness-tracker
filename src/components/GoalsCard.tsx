"use client";

import { useCallback, useEffect, useState } from "react";
import type { Unit } from "@/config/app.config";
import { goalProgress, newlyAchieved, type Goal, type GoalProgress, type GoalType } from "@/lib/domain/goals";
import { describeGoal, outlookText, progressText } from "@/lib/domain/goalText";
import type { Exercise, Session, SetEntry } from "@/lib/domain/types";
import { toKg } from "@/lib/domain/units";
import { uid } from "@/lib/store/local";
import { useApp } from "./AppProvider";
import { useToast } from "./UndoToast";

const TYPES: { id: GoalType; label: string }[] = [
  { id: "lift_e1rm", label: "Lift: est. 1RM" },
  { id: "lift_reps", label: "Lift: reps at a weight" },
  { id: "sessions_per_week", label: "Sessions per week" },
];

export interface GoalsData {
  goals: Goal[];
  progress: Map<string, GoalProgress>;
  exercises: Map<string, Exercise>;
}

/** Loads goals + the data their progress is computed from, and marks newly reached goals (once). */
export function useGoals(onReached?: (g: Goal, liftName: string | null) => void) {
  const { cfg, store, version, now } = useApp();
  const [state, setState] = useState<GoalsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [goals, sets, sessions, exercises] = await Promise.all([store.listGoals(), store.listSets(), store.listSessions(), store.listExercises()]);
      const progress = new Map(goals.map((g) => [g.id, goalProgress(g, sets as SetEntry[], sessions as Session[], now(), cfg)]));
      // Celebrate each lift goal once, the first time it's reached.
      for (const g of newlyAchieved(goals, progress)) {
        const done = { ...g, achievedAt: now().toISOString() };
        await store.saveGoal(done).catch(() => {});
        Object.assign(g, done);
        onReached?.(g, exercises.find((e) => e.id === g.exerciseId)?.name ?? null);
      }
      setState({ goals, progress, exercises: new Map(exercises.map((e) => [e.id, e])) });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, cfg, now]);

  useEffect(() => {
    void load();
  }, [load, version]);

  return { data: state, error, reload: load };
}

export function GoalRow({ goal, p, liftName, unit, onDelete }: { goal: Goal; p: GoalProgress; liftName: string | null; unit: Unit; onDelete?: () => void }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div className="spread">
        <strong style={{ fontSize: "0.95rem" }}>{describeGoal(goal, liftName, unit)}</strong>
        {onDelete && <button className="btn sm ghost" aria-label="Delete goal" onClick={onDelete}>✕</button>}
      </div>
      <div className="bar" style={{ margin: 0 }}><i style={{ width: `${Math.round(p.pct * 100)}%`, background: p.achieved ? "var(--good)" : undefined }} /></div>
      <div className="spread small">
        <span>{progressText(goal, p, unit)}</span>
        <span className="muted">{outlookText(goal, p)}{goal.deadline && !p.achieved ? ` · due ${goal.deadline}` : ""}</span>
      </div>
    </div>
  );
}

/** Progress page: all goals plus the form to add one. */
export function GoalsCard() {
  const { cfg, store, profile, refresh } = useApp();
  const toast = useToast(cfg.logging.undoToastMs);
  const { data, error, reload } = useGoals((g, liftName) => toast.show({ text: `🎯 Goal reached: ${describeGoal(g, liftName, profile.unit)}!` }));
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<GoalType>("lift_e1rm");
  const [lift, setLift] = useState("");
  const [target, setTarget] = useState("");
  const [weight, setWeight] = useState("");
  const [deadline, setDeadline] = useState("");
  const unit = profile.unit;

  const exercises = data ? [...data.exercises.values()].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const needsLift = type !== "sessions_per_week";

  const add = async () => {
    const t = Number(target);
    if (!(t > 0) || (needsLift && !lift) || (type === "lift_reps" && !(Number(weight) > 0))) return;
    const g: Goal = {
      id: uid(), type, exerciseId: needsLift ? lift : null,
      targetValue: type === "lift_e1rm" ? toKg(t, unit) : Math.round(t),
      targetWeightKg: type === "lift_reps" ? toKg(Number(weight), unit) : null,
      deadline: deadline || null, achievedAt: null, createdAt: new Date().toISOString(),
    };
    try {
      await store.saveGoal(g);
      setAdding(false);
      setTarget("");
      setWeight("");
      setDeadline("");
      await reload();
      refresh();
    } catch (e) {
      toast.show({ text: e instanceof Error ? e.message : String(e) });
    }
  };

  const remove = async (g: Goal) => {
    await store.deleteGoal(g.id);
    toast.show({ text: "Goal deleted", undo: async () => { await store.saveGoal(g); await reload(); } });
    await reload();
  };

  // Arriving from a Today widget (/progress#goals): scroll here once the content has loaded.
  useEffect(() => {
    if (data && typeof location !== "undefined" && location.hash === "#goals") document.getElementById("goals")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data]);

  return (
    <div className="card stack" id="goals">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Goals</h2>
        <button className="chip" onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "+ Goal"}</button>
      </div>
      {error && <span className="small" style={{ color: "var(--bad)" }}>{error}</span>}

      {adding && (
        <div className="stack" style={{ gap: 8, background: "var(--surface-2)", padding: 12, borderRadius: "var(--radius-sm)" }}>
          <select value={type} onChange={(e) => setType(e.target.value as GoalType)} aria-label="Goal type">
            {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          {needsLift && (
            <select value={lift} onChange={(e) => setLift(e.target.value)} aria-label="Lift">
              <option value="">Choose a lift…</option>
              {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <div className="row">
            {type === "lift_reps" && <input style={{ flex: 1 }} inputMode="decimal" placeholder={`Weight (${unit})`} value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Weight" />}
            <input
              style={{ flex: 1 }}
              inputMode="decimal"
              placeholder={type === "lift_e1rm" ? `Target 1RM (${unit})` : type === "lift_reps" ? "Reps" : "Sessions / week"}
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))}
              aria-label="Target"
            />
          </div>
          {type !== "sessions_per_week" && <label className="field">Deadline (optional)<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>}
          <button className="btn primary" onClick={add}>Save goal</button>
        </div>
      )}

      {data && !data.goals.length && !adding && <p className="muted small" style={{ margin: 0 }}>Set a target like “Bench 225” or “3 sessions a week” and track it here, on Today and with <code>/goal</code> in Discord.</p>}
      {data?.goals.map((g) => (
        <GoalRow key={g.id} goal={g} p={data.progress.get(g.id)!} liftName={g.exerciseId ? data.exercises.get(g.exerciseId)?.name ?? null : null} unit={unit} onDelete={() => remove(g)} />
      ))}
      {!!data?.goals.length && <p className="muted small" style={{ margin: 0 }}>Projections follow your last 8 weeks and are estimates, not promises.</p>}
      {toast.node}
    </div>
  );
}
