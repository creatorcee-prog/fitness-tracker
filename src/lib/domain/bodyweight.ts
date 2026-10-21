import type { AppConfig } from "@/config/app.config";
import { e1rm } from "./e1rm";
import type { Exercise, SetEntry } from "./types";

export interface BodyweightEntry {
  /** Local date, YYYY-MM-DD (one entry per day; logging again replaces it). */
  date: string;
  weightKg: number;
}

export interface BodyweightTrend {
  latest: BodyweightEntry | null;
  /** Average of the last 7 days' entries: day-to-day water swings matter less. */
  avg7: number | null;
  /** Change of the 7-day average vs the 7 days before 4 weeks ago… see below. Null when there isn't enough data. */
  change28: number | null;
  /** Rough rate per week over the last 4 weeks (kg/week), from a straight-line fit. */
  perWeek: number | null;
}

const DAY = 86_400_000;
const t = (d: string) => Date.parse(`${d}T12:00:00Z`);

/**
 * Trend from daily weigh-ins. Single weigh-ins swing 1–2 kg with water and
 * food, so the numbers shown are averages and a fitted rate, not "today vs
 * yesterday".
 */
export function bodyweightTrend(entries: BodyweightEntry[], today: string): BodyweightTrend {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1] ?? null;
  const now = t(today);
  const within = (from: number, to: number) => sorted.filter((e) => t(e.date) > now - from * DAY && t(e.date) <= now - to * DAY);
  const avg = (xs: BodyweightEntry[]) => (xs.length ? xs.reduce((a, e) => a + e.weightKg, 0) / xs.length : null);
  const avg7 = avg(within(7, 0));
  const before = avg(within(35, 28));
  const last28 = within(28, 0);
  let perWeek: number | null = null;
  if (last28.length >= 4 && t(last28[last28.length - 1].date) - t(last28[0].date) >= 10 * DAY) {
    const pts = last28.map((e) => ({ x: (t(e.date) - now) / (7 * DAY), y: e.weightKg }));
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    perWeek = den ? pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / den : null;
  }
  return { latest, avg7, change28: avg7 != null && before != null ? avg7 - before : null, perWeek };
}

/**
 * Relative strength: best recent e1RM ÷ bodyweight, per lift. Lets you see
 * strength progress while cutting (weight drops, ratio climbs) and compares
 * fairly across sizes. Uses the last `days` days of sets and the latest bodyweight.
 */
export function relativeStrength(sets: SetEntry[], exercises: Exercise[], bodyweightKg: number, cfg: AppConfig, now: Date, days = 42) {
  if (!(bodyweightKg > 0)) return [];
  const from = now.getTime() - days * DAY;
  const best = new Map<string, number>();
  for (const s of sets) {
    if (s.isWarmup || s.reps < 1 || s.reps > cfg.prs.maxRepsForE1rm || s.weightKg <= 0 || Date.parse(s.createdAt) < from) continue;
    const v = e1rm(s.weightKg, s.reps, cfg.prs.formula);
    if (v > (best.get(s.exerciseId) ?? 0)) best.set(s.exerciseId, v);
  }
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  return [...best.entries()]
    .map(([id, kg]) => ({ exercise: names.get(id) ?? "?", e1rmKg: kg, ratio: kg / bodyweightKg }))
    .sort((a, b) => b.e1rmKg - a.e1rmKg);
}
