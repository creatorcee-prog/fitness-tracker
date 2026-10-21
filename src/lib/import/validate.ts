import type { Unit } from "@/config/app.config";
import { validateAction } from "@/lib/ai/actions";
import type { GoalAction, ImportedData, ImportedProgram, ImportedSession } from "./types";

/**
 * Checks what James returned for an import. Same idea as proposed changes:
 * nothing from the model is trusted. Out-of-range values are dropped, not
 * fixed, and reported in `skipped`.
 */
export const MAX_SESSIONS = 400;
const REPS = /^\d{1,3}(-\d{1,3})?$/;

export function validateImported(raw: unknown, unit: Unit, defaults = { sets: 3, reps: "8-12" }): ImportedData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const skipped: string[] = Array.isArray(r.unclear) ? r.unclear.filter((x): x is string => typeof x === "string").slice(0, 50).map((x) => x.slice(0, 200)) : [];
  const sessions: ImportedSession[] = [];
  for (const s of (Array.isArray(r.sessions) ? r.sessions : []).slice(0, MAX_SESSIONS)) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && !Number.isNaN(Date.parse(o.date)) ? o.date : null;
    if (!date) {
      skipped.push(`A workout with no usable date (${String(o.date ?? "missing")})`);
      continue;
    }
    const day = typeof o.day === "string" && o.day.trim() ? o.day.trim().slice(0, 40) : null;
    const out: ImportedSession = { date, time: null, dayName: day, sets: [] };
    for (const x of Array.isArray(o.sets) ? o.sets : []) {
      const e = x as Record<string, unknown>;
      const name = typeof e?.e === "string" ? e.e.trim().slice(0, 60) : "";
      const w = typeof e?.w === "number" && e.w >= 0 && e.w <= 1500 ? e.w : e?.w == null ? 0 : null;
      const reps = typeof e?.r === "number" && Number.isInteger(e.r) && e.r > 0 && e.r <= 100 ? e.r : null;
      const n = e?.n == null ? 1 : typeof e.n === "number" && Number.isInteger(e.n) && e.n >= 1 && e.n <= 20 ? e.n : null;
      if (!name || w === null || reps === null || n === null) {
        skipped.push(`${date}: couldn't use ${JSON.stringify(x).slice(0, 80)}`);
        continue;
      }
      const u: Unit = e.u === "kg" || e.u === "lb" ? e.u : unit;
      const rpe = typeof e.rpe === "number" && e.rpe > 0 && e.rpe <= 10 ? e.rpe : null;
      for (let k = 0; k < n; k++) out.sets.push({ exercise: name, weight: w, unit: u, reps, rpe, warmup: e.wu === true });
    }
    if (out.sets.length) sessions.push(out);
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date));

  let program: ImportedProgram | null = null;
  const p = r.program as Record<string, unknown> | null;
  if (p && typeof p === "object" && Array.isArray(p.days)) {
    const days = p.days.slice(0, 7).flatMap((d) => {
      const o = d as Record<string, unknown>;
      const name = typeof o?.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : null;
      if (!name) return [];
      const weekday = typeof o.weekday === "number" && Number.isInteger(o.weekday) && o.weekday >= 0 && o.weekday <= 6 ? o.weekday : null;
      const exercises = (Array.isArray(o.exercises) ? o.exercises : []).slice(0, 15).flatMap((x) => {
        const e = x as Record<string, unknown>;
        const ename = typeof e?.e === "string" ? e.e.trim().slice(0, 60) : "";
        const sets = typeof e?.sets === "number" && Number.isInteger(e.sets) && e.sets >= 1 && e.sets <= 10 ? e.sets : null;
        const repsText = typeof e?.reps === "string" ? e.reps.replace(/\s|–/g, (c) => (c === "–" ? "-" : "")) : null;
        const reps = repsText && REPS.test(repsText) ? repsText : typeof e?.reps === "number" && e.reps >= 1 && e.reps <= 100 ? String(e.reps) : null;
        const w = typeof e?.w === "number" && e.w > 0 && e.w <= 1500 ? e.w : null;
        const note = typeof e?.note === "string" && e.note.trim() ? e.note.trim().slice(0, 80) : null;
        const detail = typeof e?.detail === "string" && /^[x×]\s*\d{1,2}$/i.test(e.detail.trim()) ? e.detail.replace(/\s/g, "").toLowerCase().replace("×", "x") : null;
        // Sets/reps the plan doesn't state get defaults; the preview marks them.
        return ename ? [{ name: ename, sets: sets ?? defaults.sets, reps: reps ?? defaults.reps, stated: sets !== null && reps !== null, setsStated: sets !== null, weight: w, unit: (e.u === "kg" || e.u === "lb" ? e.u : unit) as Unit, note, detail }] : [];
      });
      return exercises.length ? [{ name, weekday, exercises }] : [];
    });
    const mode = p.mode === "weekly" && days.every((d) => d.weekday !== null) ? "weekly" : "rotation";
    if (days.length) program = { name: typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 40) : "Imported program", mode, days, source: "stated" };
  }

  const goals = (Array.isArray(r.goals) ? r.goals : []).slice(0, 10).flatMap((g) => {
    const v = validateAction({ ...(g as object), type: "add_goal", deadline: (g as Record<string, unknown>)?.deadline ?? undefined });
    return v && v.type === "add_goal" ? [v as GoalAction] : [];
  });

  const terms = (Array.isArray(r.terms) ? r.terms : []).slice(0, 8).flatMap((t) => {
    const o = t as Record<string, unknown>;
    const term = typeof o?.term === "string" ? o.term.trim().slice(0, 30) : "";
    const options = (Array.isArray(o?.options) ? o.options : []).filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 40)).slice(0, 4);
    return term ? [{ term, options }] : [];
  });
  // A flagged term used as a day name gets the same question as an unexpanded code.
  if (program) for (const d of program.days) if (terms.some((t) => t.term.toLowerCase() === d.name.toLowerCase())) d.code = d.name;

  return { format: "ai", sessions, program, goals, skipped, terms };
}
