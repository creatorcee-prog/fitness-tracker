import { describe, expect, it } from "vitest";
import { defaultConfig as cfg } from "@/config/app.config";
import { e1rm } from "./e1rm";
import { goalProgress, linearFit, newlyAchieved, type Goal } from "./goals";
import type { Session, SetEntry } from "./types";

const NOW = new Date("2026-10-21T12:00:00Z");
const DAY = 86_400_000;
let n = 0;
const set = (daysAgo: number, weightKg: number, reps: number, exerciseId = "bench"): SetEntry => ({
  id: `s${++n}`, sessionId: `sess${daysAgo}`, exerciseId, setIndex: 0, weightKg, reps, rpe: null, isWarmup: false, note: null,
  createdAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
});
const goal = (over: Partial<Goal>): Goal => ({ id: "g", type: "lift_e1rm", exerciseId: "bench", targetValue: 120, targetWeightKg: null, deadline: null, achievedAt: null, createdAt: NOW.toISOString(), ...over });

describe("linearFit", () => {
  it("fits a line", () => expect(linearFit([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])).toEqual({ slope: 2, intercept: 1 }));
  it("needs spread in x", () => expect(linearFit([{ x: 1, y: 1 }, { x: 1, y: 2 }])).toBeNull());
});

describe("goalProgress", () => {
  // Steady +2.5 kg per week on 5-rep sets over 8 weeks.
  const rising = Array.from({ length: 8 }, (_, i) => set(52 - i * 7, 90 + i * 2.5, 5));

  it("e1RM goal: progress and a projection from the trend", () => {
    const p = goalProgress(goal({ targetValue: 130 }), rising, [], NOW, cfg);
    expect(p.current).toBeCloseTo(e1rm(107.5, 5), 3);
    expect(p.achieved).toBe(false);
    expect(p.pct).toBeGreaterThan(0.9);
    expect(p.projectedDate).not.toBeNull();
    expect(Date.parse(p.projectedDate!)).toBeGreaterThan(NOW.getTime());
  });
  it("e1RM goal: achieved", () => {
    const p = goalProgress(goal({ targetValue: 120 }), rising, [], NOW, cfg);
    expect(p).toMatchObject({ achieved: true, pct: 1, projectedDate: null });
  });
  it("e1RM goal: no projection without enough data or when flat", () => {
    expect(goalProgress(goal({ targetValue: 200 }), rising.slice(-2), [], NOW, cfg).note).toContain("few more weeks");
    const flat = Array.from({ length: 5 }, (_, i) => set(35 - i * 7, 100, 5));
    expect(goalProgress(goal({ targetValue: 200 }), flat, [], NOW, cfg).note).toContain("Not trending up");
  });
  it("e1RM goal ignores other lifts, warm-ups and high-rep sets", () => {
    const sets = [set(1, 200, 5, "squat"), { ...set(1, 200, 5), isWarmup: true }, set(1, 100, 15), set(1, 80, 5)];
    expect(goalProgress(goal({ targetValue: 150 }), sets, [], NOW, cfg).current).toBeCloseTo(e1rm(80, 5), 3);
  });
  it("reps-at-weight goal counts sets at or above the weight", () => {
    const g = goal({ type: "lift_reps", targetValue: 8, targetWeightKg: 100 });
    const p = goalProgress(g, [set(3, 100, 6), set(2, 102.5, 7), set(1, 90, 12)], [], NOW, cfg);
    expect(p).toMatchObject({ current: 7, target: 8, achieved: false });
  });
  it("sessions-per-week goal resets weekly", () => {
    const s = (iso: string): Session => ({ id: iso, splitDayId: null, startedAt: iso, finishedAt: iso, source: "web" });
    const sessions = [s("2026-10-19T10:00:00Z"), s("2026-10-20T10:00:00Z"), s("2026-10-14T10:00:00Z")];
    const p = goalProgress(goal({ type: "sessions_per_week", exerciseId: null, targetValue: 3 }), [], sessions, NOW, cfg);
    expect(p).toMatchObject({ current: 2, target: 3, weekly: true, achieved: false });
  });
  it("finds goals to celebrate once", () => {
    const g1 = goal({ id: "a", targetValue: 100 });
    const g2 = goal({ id: "b", targetValue: 100, achievedAt: NOW.toISOString() });
    const prog = new Map([["a", goalProgress(g1, rising, [], NOW, cfg)], ["b", goalProgress(g2, rising, [], NOW, cfg)]]);
    expect(newlyAchieved([g1, g2], prog).map((g) => g.id)).toEqual(["a"]);
  });
});
