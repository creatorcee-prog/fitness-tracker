import { describe, expect, it } from "vitest";
import { streakInfo, weeklyStreak } from "./stats";
import type { Session } from "./types";

// Weeks start Sunday. "Now" is Wednesday 2026-10-21.
const NOW = new Date(2026, 9, 21, 12);
const DAY = 86_400_000;
/** One finished session per entry, `weeksAgo` weeks before this week's Monday. */
const sess = (weeksAgo: number, n = 3): Session[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(2026, 9, 19 + i - weeksAgo * 7, 18).toISOString();
    return { id: `${weeksAgo}-${i}`, splitDayId: null, startedAt: d, finishedAt: d, source: "web" };
  });
const rules = { every: 4, max: 2 };

describe("streak freezes", () => {
  it("without freezes, a missed week resets the streak (old behaviour)", () => {
    const s = [...sess(1), ...sess(2), ...sess(4), ...sess(5)]; // week 3 missed
    expect(weeklyStreak(s, NOW, 0, 3)).toBe(2);
  });
  it("earns a freeze every 4 weeks on target and spends it on a missed week", () => {
    const s = [6, 5, 4, 3, 1].flatMap((w) => sess(w)); // 4 good weeks, miss week 2, then good
    expect(streakInfo(s, NOW, 0, 3, rules)).toEqual({ weeks: 5, freezes: 0, frozen: 1 });
  });
  it("saves up to the max and resets when there's no freeze left", () => {
    const good = Array.from({ length: 12 }, (_, i) => i + 4).flatMap((w) => sess(w)); // 12 good weeks, ending 4 weeks ago
    const at = (weeksBack: number) => new Date(NOW.getTime() - weeksBack * 7 * DAY);
    expect(streakInfo(good, at(3), 0, 3, rules)).toEqual({ weeks: 12, freezes: 2, frozen: 0 }); // 3 earned, max 2
    expect(streakInfo(good, at(1), 0, 3, rules)).toEqual({ weeks: 12, freezes: 0, frozen: 2 }); // two missed weeks covered
    expect(streakInfo(good, NOW, 0, 3, rules)).toEqual({ weeks: 0, freezes: 0, frozen: 0 }); // a third miss resets
  });
  it("this week counts once it's on target, and is never a miss while it's going", () => {
    const s = [...sess(1), ...sess(0, 1)]; // this week: 1 of 3 so far
    expect(streakInfo(s, NOW, 0, 3, rules).weeks).toBe(1);
    expect(streakInfo([...sess(1), ...sess(0, 3)], new Date(2026, 9, 24, 20), 0, 3, rules).weeks).toBe(2);
  });
});
