import type { AppConfig } from "@/config/app.config";
import { e1rm } from "./e1rm";
import type { SetEntry } from "./types";

const DAY = 86_400_000;

function bestE1rmBetween(sets: SetEntry[], from: number, to: number, cfg: AppConfig): number | null {
  let best: number | null = null;
  for (const s of sets) {
    const t = Date.parse(s.createdAt);
    if (t < from || t > to || s.isWarmup || s.reps > cfg.prs.maxRepsForE1rm) continue;
    const v = e1rm(s.weightKg, s.reps, cfg.prs.formula);
    if (best === null || v > best) best = v;
  }
  return best;
}

export interface Gain {
  baselineId: string;
  label: string;
  baseline: number | null;
  current: number | null;
  percent: number | null;
}

/**
 * % gain = (best e1RM in the last `currentWindowDays` − baseline) ÷ baseline × 100.
 * Baseline = best e1RM on the first logged day, or best in the same-length
 * window ending N days ago.
 */
export function percentageGains(sets: SetEntry[], now: Date, cfg: AppConfig): Gain[] {
  const t = now.getTime();
  const win = cfg.progress.currentWindowDays * DAY;
  const current = bestE1rmBetween(sets, t - win, t, cfg);
  const working = sets.filter((s) => !s.isWarmup && s.reps <= cfg.prs.maxRepsForE1rm);
  const firstT = working.length ? Math.min(...working.map((s) => Date.parse(s.createdAt))) : null;

  return cfg.progress.baselines.map((b) => {
    let baseline: number | null = null;
    if (b.daysAgo == null) {
      if (firstT != null) baseline = bestE1rmBetween(sets, firstT, firstT + DAY, cfg);
    } else {
      const end = t - b.daysAgo * DAY;
      baseline = bestE1rmBetween(sets, end - win, end, cfg);
    }
    const percent = baseline && current != null ? ((current - baseline) / baseline) * 100 : null;
    return { baselineId: b.id, label: b.label, baseline, current, percent };
  });
}
