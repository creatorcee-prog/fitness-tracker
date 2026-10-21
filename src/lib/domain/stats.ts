import type { Session, SetEntry } from "./types";

const DAY = 86_400_000;

/** Start (local midnight, as a Date) of the week containing `now`. */
export function weekStart(now: Date, weekStartsOn: number): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return new Date(d.getTime() - diff * DAY);
}

export function finishedBetween(sessions: Session[], from: Date, to: Date): Session[] {
  return sessions.filter((s) => s.finishedAt && Date.parse(s.finishedAt) >= from.getTime() && Date.parse(s.finishedAt) < to.getTime());
}

/**
 * Weekly consistency streak: consecutive weeks (ending with the current week
 * if it already hits the target, otherwise last week) with ≥ target sessions.
 */
export function weeklyStreak(sessions: Session[], now: Date, weekStartsOn: number, target: number): number {
  let start = weekStart(now, weekStartsOn);
  let end = new Date(now.getTime() + 1);
  let streak = 0;
  const thisWeek = finishedBetween(sessions, start, end).length;
  if (thisWeek >= target) streak++;
  for (let i = 0; i < 520; i++) {
    end = start;
    start = new Date(start.getTime() - 7 * DAY);
    if (finishedBetween(sessions, start, end).length >= target) streak++;
    else break;
  }
  return streak;
}

export function volumeKg(sets: SetEntry[]): number {
  return sets.filter((s) => !s.isWarmup).reduce((a, s) => a + s.weightKg * s.reps, 0);
}
