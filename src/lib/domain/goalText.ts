import type { Unit } from "@/config/app.config";
import type { Goal, GoalProgress } from "./goals";
import { fromKg } from "./units";

const w = (kg: number, unit: Unit) => `${Number(fromKg(kg, unit).toFixed(1))} ${unit}`;

/** "Bench Press est. 1RM 250 lb", "Squat 8 reps at 225 lb", "3 sessions a week". Shared by the app, Discord and /ask. */
export function describeGoal(g: Goal, liftName: string | null, unit: Unit): string {
  const lift = liftName ?? "Lift";
  switch (g.type) {
    case "lift_e1rm": return `${lift} est. 1RM ${w(g.targetValue, unit)}`;
    case "lift_reps": return `${lift} ${g.targetValue} reps at ${w(g.targetWeightKg ?? 0, unit)}`;
    case "sessions_per_week": return `${g.targetValue} session${g.targetValue === 1 ? "" : "s"} a week`;
    case "bodyweight": return `Bodyweight ${w(g.targetValue, unit)}`;
    case "walk_distance": return `Walk ${g.targetValue} km a week`;
  }
}

/** "231 / 250 lb (92%)", "6 / 8 reps", "2 / 3 this week". */
export function progressText(g: Goal, p: GoalProgress, unit: Unit): string {
  const pct = `${Math.round(p.pct * 100)}%`;
  switch (g.type) {
    case "lift_e1rm": return `${Number(fromKg(p.current, unit).toFixed(1))} / ${w(p.target, unit)} (${pct})`;
    case "lift_reps": return `${p.current} / ${p.target} reps`;
    case "sessions_per_week": return `${p.current} / ${p.target} this week`;
    default: return pct;
  }
}

/** "Projected Dec 3" / the reason there's no projection / "Reached ✓". */
export function outlookText(g: Goal, p: GoalProgress): string {
  if (p.achieved) return p.weekly ? "Done this week ✓" : "Reached ✓";
  if (p.projectedDate) {
    const d = new Date(p.projectedDate + "T12:00:00");
    const late = g.deadline && p.projectedDate > g.deadline;
    return `Projected ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}${late ? " (after your deadline)" : ""}`;
  }
  return p.note ?? "";
}
