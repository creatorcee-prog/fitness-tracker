import type { SetEntry } from "./types";

/**
 * Leaderboard row: average % gain in best estimated 1RM per lift, last 4
 * weeks vs weeks 8–12 ago. Mirrors leaderboard_for() in migration 0015 (the
 * database computes it for real; this is for the local backend and tests).
 */
export interface LeaderboardRow {
  userId: string;
  name: string;
  isYou: boolean;
  /** Lifts with data in both windows. 0 = not enough history yet. */
  lifts: number;
  avgGain: number | null;
  topLift: string | null;
  topGain: number | null;
}

const DAY = 86_400_000;
const epley = (w: number, r: number) => w * (1 + r / 30);

export function leaderboardRow(user: { id: string; name: string; isYou: boolean }, sets: SetEntry[], exerciseName: (id: string) => string, now: Date): LeaderboardRow {
  const t = now.getTime();
  const cur = new Map<string, number>(), base = new Map<string, number>();
  for (const s of sets) {
    const at = Date.parse(s.createdAt);
    if (s.isWarmup || s.reps < 1 || s.reps > 10 || s.weightKg <= 0 || at <= t - 84 * DAY) continue;
    const v = epley(s.weightKg, s.reps);
    if (at > t - 28 * DAY) cur.set(s.exerciseId, Math.max(cur.get(s.exerciseId) ?? 0, v));
    if (at <= t - 56 * DAY) base.set(s.exerciseId, Math.max(base.get(s.exerciseId) ?? 0, v));
  }
  const gains = [...cur.entries()].filter(([id]) => (base.get(id) ?? 0) > 0).map(([id, c]) => ({ lift: exerciseName(id), gain: (c / base.get(id)! - 1) * 100 }));
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const top = gains.sort((a, b) => b.gain - a.gain)[0];
  return {
    userId: user.id, name: user.name, isYou: user.isYou, lifts: gains.length,
    avgGain: gains.length ? r1(gains.reduce((a, g) => a + g.gain, 0) / gains.length) : null,
    topLift: top?.lift ?? null, topGain: top ? r1(top.gain) : null,
  };
}

export const sortLeaderboard = (rows: LeaderboardRow[]) => [...rows].sort((a, b) => (b.avgGain ?? -Infinity) - (a.avgGain ?? -Infinity));
