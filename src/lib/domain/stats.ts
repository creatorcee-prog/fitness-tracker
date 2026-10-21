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
/** Streak freezes: one is earned every `every` weeks on target (up to `max` saved); a missed week uses one. 0 = off. */
export interface FreezeRules {
  every: number;
  max: number;
}

export interface StreakInfo {
  /** Weeks in a row on target (frozen weeks keep the streak alive but don't add to it). */
  weeks: number;
  /** Freezes saved for a future missed week. */
  freezes: number;
  /** Missed weeks a freeze covered during the current streak. */
  frozen: number;
}

/**
 * Weekly streak with forgiving freezes. Research on streaks: an intact
 * streak keeps people going, a broken one makes them quit, and being able
 * to repair it softens that. The current week only counts once it's on
 * target; it's never a miss while it's still going.
 */
export function streakInfo(sessions: Session[], now: Date, weekStartsOn: number, target: number, rules: FreezeRules = { every: 0, max: 0 }): StreakInfo {
  const current = weekStart(now, weekStartsOn);
  const first = sessions.filter((s) => s.finishedAt).map((s) => Date.parse(s.startedAt)).sort((a, b) => a - b)[0];
  let weeks = 0, freezes = 0, frozen = 0, sinceEarn = 0;
  if (first !== undefined) {
    // Oldest week first (at most 10 years back), so freezes are earned before they're spent.
    let start = weekStart(new Date(Math.max(first, current.getTime() - 520 * 7 * DAY)), weekStartsOn);
    while (start < current) {
      const end = new Date(start.getTime() + 7 * DAY);
      if (finishedBetween(sessions, start, end).length >= target) {
        weeks++;
        if (rules.every > 0 && ++sinceEarn >= rules.every) {
          freezes = Math.min(rules.max, freezes + 1);
          sinceEarn = 0;
        }
      } else if (freezes > 0 && weeks > 0) {
        freezes--;
        frozen++;
      } else {
        weeks = 0;
        frozen = 0;
        sinceEarn = 0;
      }
      start = end;
    }
  }
  if (finishedBetween(sessions, current, new Date(now.getTime() + 1)).length >= target) weeks++;
  return { weeks, freezes, frozen };
}

/** The app's freeze rules from config (`streak.*`). */
export const freezeRules = (cfg: { streak: { freezeEveryWeeks: number; maxFreezes: number } }): FreezeRules => ({ every: cfg.streak.freezeEveryWeeks, max: cfg.streak.maxFreezes });

export function weeklyStreak(sessions: Session[], now: Date, weekStartsOn: number, target: number, rules?: FreezeRules): number {
  return streakInfo(sessions, now, weekStartsOn, target, rules).weeks;
}

export function volumeKg(sets: SetEntry[]): number {
  return sets.filter((s) => !s.isWarmup).reduce((a, s) => a + s.weightKg * s.reps, 0);
}
