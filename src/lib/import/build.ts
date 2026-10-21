import type { AppConfig, Category } from "@/config/app.config";
import { matchExercise } from "@/lib/domain/match";
import type { Exercise, Session, SetEntry, Split } from "@/lib/domain/types";
import { toKg } from "@/lib/domain/units";
import type { ExportData } from "@/lib/importPlan";
import type { ImportedData, ImportedProgram } from "./types";

/** Best guess for a new lift's category (used for rest times and weight jumps; editable later). */
export function guessCategory(name: string): Category {
  const n = name.toLowerCase();
  if (/run|jog|bike|cycl|row(ing)? machine|erg|treadmill|elliptical|swim|walk|stair/.test(n)) return "cardio";
  if (/plank|crunch|sit[\s-]?up|\babs?\b|hollow|leg raise|russian twist|ab wheel|pallof/.test(n)) return "core";
  if (/squat|dead|rdl|lunge|leg|calf|hip thrust|glute|hamstring|quad|step[\s-]?up|good morning/.test(n)) return "lower";
  if (/bench|press|row|pull|chin|dip|curl|fly|raise|extension|tricep|bicep|shrug|push|lat/.test(n)) return "upper";
  return "other";
}

export interface ImportChoices {
  history: boolean;
  program: boolean;
  /** Make the imported split your active one (otherwise it's saved inactive unless you have none). */
  activate: boolean;
  goals: boolean;
}

export interface ImportPreview {
  /** Imported name → the existing lift it will log under (null = a new lift with this name). */
  lifts: { name: string; existing: string | null; sets: number }[];
  sessions: number;
  sets: number;
  from: string | null;
  to: string | null;
}

/**
 * Turns read data into the same shape as a JSON export, so the existing
 * importer saves it (fresh ids, sessions already present are skipped, PRs
 * rebuilt). Lifts are matched to yours by name (aliases, initials, prefix);
 * anything unmatched becomes a new lift with the name you wrote.
 */
export function buildImport(data: ImportedData, program: ImportedProgram | null, existing: Exercise[], choices: ImportChoices, cfg: AppConfig, newId: () => string) {
  const exByKey = new Map<string, Exercise>();
  const newExercises: Exercise[] = [];
  const counts = new Map<string, number>();
  const resolve = (name: string): Exercise => {
    const key = name.trim().toLowerCase();
    const hit = exByKey.get(key);
    if (hit) return hit;
    // Match to one of your lifts only when it's clearly the same one: exact name, an alias
    // ("ohp"), initials ("bp"), or the start of the name ("bench" → "Bench Press").
    // Anything looser ("press" → "Leg Press"?) becomes a new lift with the name as written.
    const match = matchExercise(name, existing, cfg.logging.aliases) ?? matchExercise(name, newExercises);
    const n = match?.name.toLowerCase() ?? "";
    const initials = n.split(/[\s-]+/).map((w) => w[0]).join("");
    const viaAlias = Object.keys(cfg.logging.aliases).some((k) => k.toLowerCase() === key);
    const ok = !!match && (n === key || viaAlias || initials === key.replace(/\s+/g, "") || (key.length >= 4 && n.startsWith(key)));
    const ex = ok ? match! : { id: newId(), name: name.trim(), category: guessCategory(name), equipment: null, incrementKg: null, ownerId: "import" };
    if (!ok) newExercises.push(ex);
    exByKey.set(key, ex);
    return ex;
  };

  const sessions: Session[] = [];
  const sets: SetEntry[] = [];
  if (choices.history) {
    for (const s of data.sessions) {
      const start = new Date(`${s.date}T${s.time ?? "18:00"}:00`);
      if (Number.isNaN(start.getTime())) continue;
      const id = newId();
      let i = 0;
      for (const x of s.sets) {
        const ex = resolve(x.exercise);
        counts.set(ex.name, (counts.get(ex.name) ?? 0) + 1);
        sets.push({
          id: newId(), sessionId: id, exerciseId: ex.id, setIndex: i, weightKg: toKg(x.weight, x.unit), reps: x.reps, rpe: x.rpe,
          isWarmup: x.warmup, note: null, createdAt: new Date(start.getTime() + (i + 1) * 120_000).toISOString(),
        });
        i++;
      }
      sessions.push({ id, splitDayId: null, startedAt: start.toISOString(), finishedAt: new Date(start.getTime() + (i + 1) * 120_000).toISOString(), source: "web" });
    }
  }

  const splits: Split[] = [];
  if (choices.program && program?.days.length) {
    const splitId = newId();
    splits.push({
      id: splitId, name: program.name, mode: program.mode, isActive: true,
      days: program.days.map((d, position) => ({
        id: newId(), splitId, position, name: d.name, weekday: program.mode === "weekly" ? d.weekday : null,
        exercises: d.exercises.map((x, order) => ({
          exerciseId: resolve(x.name).id, order, targetSets: x.sets, repRange: x.reps,
          startWeightKg: x.weight != null && x.weight > 0 ? toKg(x.weight, x.unit ?? "lb") : null, note: x.note ?? null,
        })),
      })),
    });
  }

  const all = [...existing, ...newExercises];
  const exportData: ExportData & { merge: true } = { merge: true, exercises: all, splits, sessions, sets };
  const preview: ImportPreview = {
    lifts: [...exByKey.entries()].map(([key, ex]) => ({ name: data.sessions.flatMap((s) => s.sets).find((x) => x.exercise.trim().toLowerCase() === key)?.exercise ?? ex.name, existing: newExercises.includes(ex) ? null : ex.name, sets: counts.get(ex.name) ?? 0 })),
    sessions: sessions.length,
    sets: sets.length,
    from: data.sessions[0]?.date ?? null,
    to: data.sessions[data.sessions.length - 1]?.date ?? null,
  };
  return { exportData, preview };
}
