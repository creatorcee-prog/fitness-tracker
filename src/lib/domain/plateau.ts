import type { AppConfig } from "@/config/app.config";
import { e1rm } from "./e1rm";
import type { Exercise, SetEntry } from "./types";

/**
 * Plateau detection. A lift is stalled when you've kept training it but your
 * best estimated 1RM hasn't beaten its earlier best for a few weeks. Getting
 * stronger over time needs progressive overload (a little more weight, reps
 * or sets than last time), so each plateau comes with one concrete next step,
 * escalating the longer it lasts: small bump → change the rep range → deload.
 */
export interface Plateau {
  exerciseId: string;
  name: string;
  /** Weeks since the lift last set a new best (only counting weeks you trained it). */
  weeks: number;
  bestKg: number;
  suggestion: "bump" | "rep-range" | "deload";
  advice: string;
}

const WEEK = 7 * 86_400_000;

export function detectPlateaus(sets: SetEntry[], exercises: Exercise[], now: Date, cfg: AppConfig, opts = { minWeeks: 3, lookbackWeeks: 12 }): Plateau[] {
  const names = new Map(exercises.map((e) => [e.id, e]));
  const from = now.getTime() - opts.lookbackWeeks * WEEK;
  const byEx = new Map<string, SetEntry[]>();
  for (const s of sets) {
    if (s.isWarmup || s.reps < 1 || s.reps > cfg.prs.maxRepsForE1rm || s.weightKg <= 0 || Date.parse(s.createdAt) < from) continue;
    byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
  }

  const out: Plateau[] = [];
  for (const [id, xs] of byEx) {
    const ex = names.get(id);
    if (!ex || ex.category === "cardio") continue;
    // Best e1RM per week, oldest first (weeks you didn't train it are skipped, not counted as stalls).
    const weekly = new Map<number, number>();
    for (const s of xs) {
      const w = Math.floor((now.getTime() - Date.parse(s.createdAt)) / WEEK);
      weekly.set(w, Math.max(weekly.get(w) ?? 0, e1rm(s.weightKg, s.reps, cfg.prs.formula)));
    }
    const weeks = [...weekly.entries()].sort((a, b) => b[0] - a[0]); // oldest first
    if (weeks.length < opts.minWeeks + 1) continue;
    // The last week that beat everything before it (by more than ~1%, so noise doesn't count).
    let best = 0;
    let lastRecordIdx = 0;
    weeks.forEach(([, v], i) => {
      if (v > best * 1.01) {
        best = Math.max(best, v);
        lastRecordIdx = i;
      } else best = Math.max(best, v);
    });
    const stalled = weeks.length - 1 - lastRecordIdx;
    // Must still be training it: at least one session in the last 2 weeks.
    if (stalled < opts.minWeeks || weeks[weeks.length - 1][0] > 1) continue;
    const suggestion = stalled >= 6 ? "deload" : stalled >= 4 ? "rep-range" : "bump";
    out.push({ exerciseId: id, name: ex.name, weeks: stalled, bestKg: best, suggestion, advice: ADVICE[suggestion](ex.name) });
  }
  return out.sort((a, b) => b.weeks - a.weeks);
}

const ADVICE: Record<Plateau["suggestion"], (lift: string) => string> = {
  bump: (lift) => `Beat last time on ${lift}: one more rep on each set, or the smallest weight jump. Small wins add up!`,
  "rep-range": (lift) => `Shake up ${lift}: if you've been doing sets of 5, switch to 8–10 for a few weeks (or the other way round), then come back.`,
  deload: (lift) => `Time for a reset on ${lift}: take about 10% off for a week, then build back up. You'll often blow past the old best.`,
};
