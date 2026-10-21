import type { AppConfig } from "@/config/app.config";
import { e1rm } from "./e1rm";
import { finishedBetween, weekStart } from "./stats";
import type { Session, SetEntry } from "./types";

export type GoalType = "lift_e1rm" | "lift_reps" | "sessions_per_week" | "bodyweight" | "walk_distance";

export interface Goal {
  id: string;
  type: GoalType;
  exerciseId: string | null;
  /** kg for lift_e1rm, reps for lift_reps, sessions for sessions_per_week. */
  targetValue: number;
  /** kg; lift_reps only ("8 reps at 100 kg"). */
  targetWeightKg: number | null;
  /** YYYY-MM-DD or null. */
  deadline: string | null;
  achievedAt: string | null;
  createdAt: string;
}

export interface GoalProgress {
  current: number;
  target: number;
  /** 0..1 */
  pct: number;
  achieved: boolean;
  /** Projected date (YYYY-MM-DD) from the last 8 weeks' trend, when there's an upward trend to project. */
  projectedDate: string | null;
  /** Why there's no projection, e.g. "not enough data yet". */
  note: string | null;
  /** Weekly goals reset every week; lift goals are one-off. */
  weekly: boolean;
}

const DAY = 86_400_000;

/** Least-squares slope (y per x) and intercept. */
export function linearFit(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  const sxx = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx;
  return { slope, intercept: my - slope * mx };
}

/** Best estimated 1RM per week over the last `weeks` weeks (working sets within the e1RM rep cap). */
function weeklyBestE1rm(sets: SetEntry[], now: Date, cfg: AppConfig, weeks = 8): { x: number; y: number }[] {
  const from = now.getTime() - weeks * 7 * DAY;
  const byWeek = new Map<number, number>();
  for (const s of sets) {
    const t = Date.parse(s.createdAt);
    if (t < from || t > now.getTime() || s.isWarmup || s.reps > cfg.prs.maxRepsForE1rm) continue;
    const wk = Math.floor((t - from) / (7 * DAY));
    byWeek.set(wk, Math.max(byWeek.get(wk) ?? 0, e1rm(s.weightKg, s.reps, cfg.prs.formula)));
  }
  // x in days from `from`, at the middle of each week
  return [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([wk, y]) => ({ x: wk * 7 + 3.5, y }));
}

/**
 * Progress for one goal, computed from logged data (never stored).
 * `sets` may contain every set; only the goal's lift is used.
 */
export function goalProgress(goal: Goal, sets: SetEntry[], sessions: Session[], now: Date, cfg: AppConfig): GoalProgress {
  const base = { projectedDate: null as string | null, note: null as string | null, weekly: false };
  const lift = sets.filter((s) => s.exerciseId === goal.exerciseId && !s.isWarmup && Date.parse(s.createdAt) <= now.getTime());

  if (goal.type === "lift_e1rm") {
    const eligible = lift.filter((s) => s.reps <= cfg.prs.maxRepsForE1rm);
    const current = eligible.reduce((m, s) => Math.max(m, e1rm(s.weightKg, s.reps, cfg.prs.formula)), 0);
    const achieved = current >= goal.targetValue - 1e-6;
    const out: GoalProgress = { ...base, current, target: goal.targetValue, pct: goal.targetValue > 0 ? Math.min(1, current / goal.targetValue) : 0, achieved };
    if (achieved) return out;
    const pts = weeklyBestE1rm(lift, now, cfg);
    if (pts.length < 3) return { ...out, note: "Log a few more weeks to see a projection" };
    const fit = linearFit(pts);
    if (!fit || fit.slope <= 0) return { ...out, note: "Not trending up over the last 8 weeks" };
    const from = now.getTime() - 8 * 7 * DAY;
    const dayReached = (goal.targetValue - fit.intercept) / fit.slope; // days from `from`
    const date = new Date(from + Math.max(dayReached, (now.getTime() - from) / DAY) * DAY);
    if (date.getTime() - now.getTime() > 2 * 365 * DAY) return { ...out, note: "More than 2 years away at the current pace" };
    return { ...out, projectedDate: date.toISOString().slice(0, 10) };
  }

  if (goal.type === "lift_reps") {
    const w = goal.targetWeightKg ?? 0;
    const current = lift.filter((s) => s.weightKg >= w - 1e-6).reduce((m, s) => Math.max(m, s.reps), 0);
    const achieved = current >= goal.targetValue;
    return { ...base, current, target: goal.targetValue, pct: goal.targetValue > 0 ? Math.min(1, current / goal.targetValue) : 0, achieved };
  }

  if (goal.type === "sessions_per_week") {
    const current = finishedBetween(sessions, weekStart(now, cfg.split.weekStartsOn), new Date(now.getTime() + 1)).length;
    return { ...base, weekly: true, current, target: goal.targetValue, pct: goal.targetValue > 0 ? Math.min(1, current / goal.targetValue) : 0, achieved: current >= goal.targetValue };
  }

  // bodyweight / walk_distance: no data source in the app yet
  return { ...base, current: 0, target: goal.targetValue, pct: 0, achieved: false, note: "Tracking for this goal type isn't built yet" };
}

/** Lift goals that are reached but not yet celebrated (achievedAt unset). */
export function newlyAchieved(goals: Goal[], progress: Map<string, GoalProgress>): Goal[] {
  return goals.filter((g) => !g.achievedAt && g.type !== "sessions_per_week" && progress.get(g.id)?.achieved);
}
