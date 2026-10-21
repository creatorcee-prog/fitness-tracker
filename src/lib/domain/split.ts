import type { Split, SplitDay, SplitState } from "./types";

/** Weekday (0 = Sunday) of `date` in an IANA timezone. */
export function weekdayIn(date: Date, timezone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Calendar date (YYYY-MM-DD) of `date` in an IANA timezone. */
export function localDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function sortedDays(split: Split): SplitDay[] {
  return [...split.days].sort((a, b) => a.position - b.position);
}

export type Today =
  | { kind: "day"; day: SplitDay }
  | { kind: "rest" }
  | { kind: "no-split" };

/**
 * THE one function that decides what day it is. Mirrors get_today() in
 * supabase/migrations/0001_init.sql — keep them in sync.
 */
export function getToday(split: Split | null, state: SplitState | null, now: Date, timezone: string): Today {
  if (!split || split.days.length === 0) return { kind: "no-split" };
  const days = sortedDays(split);

  if (split.mode === "weekly") {
    const wd = weekdayIn(now, timezone);
    const day = days.find((d) => d.weekday === wd);
    return day ? { kind: "day", day } : { kind: "rest" };
  }

  const pos = state && state.splitId === split.id ? state.nextPosition : days[0].position;
  const day = days.find((d) => d.position === pos) ?? days[0];
  return { kind: "day", day };
}

/** Position that follows `position` in a rotation (wraps around). */
export function nextPosition(split: Split, position: number): number {
  const days = sortedDays(split);
  if (days.length === 0) return 0;
  const idx = days.findIndex((d) => d.position === position);
  return days[(idx + 1) % days.length].position;
}

/** New state after finishing (or skipping) the given day. */
export function advance(split: Split, state: SplitState | null, completedDay: SplitDay, at: Date, logged: boolean): SplitState {
  return {
    splitId: split.id,
    nextPosition: nextPosition(split, completedDay.position),
    lastCompletedAt: logged ? at.toISOString() : state?.lastCompletedAt ?? null,
  };
}
