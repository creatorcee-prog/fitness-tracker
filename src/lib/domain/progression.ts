import type { AppConfig, Category, Unit } from "@/config/app.config";
import type { SetEntry } from "./types";
import { fromKg, roundTo, toKg } from "./units";

/** "5-8" → {min:5,max:8}; "5" → {min:5,max:5}. */
export function parseRepRange(range: string): { min: number; max: number } {
  const m = range.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  const n = Number(range.match(/\d+/)?.[0] ?? 5);
  return { min: n, max: n };
}

export interface Prefill {
  weightKg: number;
  reps: number;
  /** Why this was suggested, shown under the row. */
  reason: "last-time" | "progression" | "plan" | "hold-missed";
}

/**
 * Prefill for set N of an exercise, from last session's working sets.
 * Double progression: when every last-session set reached the top of the rep
 * range, suggest a small jump; never increase after a missed rep.
 */
export function prefillFor(
  setIndex: number,
  lastSession: SetEntry[],
  repRange: string,
  category: Category,
  unit: Unit,
  cfg: AppConfig,
  stepKg: number,
): Prefill | null {
  const working = lastSession.filter((s) => !s.isWarmup).sort((a, b) => a.setIndex - b.setIndex);
  const { min, max } = parseRepRange(repRange);
  if (working.length === 0) return { weightKg: 0, reps: max, reason: "plan" };

  const ref = working[Math.min(setIndex, working.length - 1)];
  const allHitTop = working.every((s) => s.reps >= max);
  const missed = working.some((s) => s.reps < min);

  if (cfg.progression.enabled && allHitTop && !(missed && cfg.progression.holdAfterMissedRep)) {
    const jumpDisplay = cfg.progression.jump[unit][category] ?? 0;
    if (jumpDisplay > 0) {
      const next = toKg(roundTo(fromKg(ref.weightKg, unit) + jumpDisplay, fromKg(stepKg, unit)), unit);
      return { weightKg: next, reps: min, reason: "progression" };
    }
  }
  return { weightKg: ref.weightKg, reps: ref.reps, reason: missed ? "hold-missed" : "last-time" };
}
