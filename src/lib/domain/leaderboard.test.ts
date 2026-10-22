import { describe, expect, it } from "vitest";
import { leaderboardRow, sortLeaderboard } from "./leaderboard";
import type { SetEntry } from "./types";

const NOW = new Date("2026-10-21T12:00:00Z");
let n = 0;
const s = (daysAgo: number, ex: string, kg: number, reps = 5, warm = false): SetEntry => ({ id: `${++n}`, sessionId: "x", exerciseId: ex, setIndex: 0, weightKg: kg, reps, rpe: null, isWarmup: warm, note: null, createdAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString() });
const name = (id: string) => ({ bp: "Bench", sq: "Squat", dl: "Deadlift" })[id] ?? id;

describe("leaderboard (% gain)", () => {
  it("averages % e1RM gain per lift: last 4 weeks vs 8–12 weeks ago", () => {
    const r = leaderboardRow({ id: "u", name: "Cee", isYou: true }, [s(70, "bp", 100), s(5, "bp", 110), s(80, "sq", 100), s(3, "sq", 120), s(40, "dl", 200), s(2, "dl", 180)], name, NOW);
    expect(r).toMatchObject({ lifts: 2, avgGain: 15, topLift: "Squat", topGain: 20 }); // deadlift has no 8–12 week baseline
  });
  it("ignores warm-ups and high-rep sets; no history → no score", () => {
    expect(leaderboardRow({ id: "u", name: "A", isYou: false }, [s(70, "bp", 100), s(5, "bp", 200, 5, true), s(5, "bp", 150, 15)], name, NOW).lifts).toBe(0);
  });
  it("sorts by average gain, people without a score last", () => {
    const rows = [{ userId: "a", name: "A", isYou: false, lifts: 0, avgGain: null, topLift: null, topGain: null }, { userId: "b", name: "B", isYou: false, lifts: 2, avgGain: 3, topLift: "x", topGain: 4 }, { userId: "c", name: "C", isYou: true, lifts: 1, avgGain: 8, topLift: "y", topGain: 8 }];
    expect(sortLeaderboard(rows).map((r) => r.userId)).toEqual(["c", "b", "a"]);
  });
});
