import { describe, expect, it } from "vitest";
import { defaultConfig as cfg } from "@/config/app.config";
import { bodyweightTrend, relativeStrength } from "./bodyweight";
import type { SetEntry } from "./types";

const day = (i: number) => new Date(Date.UTC(2026, 9, 21 - i)).toISOString().slice(0, 10);

describe("bodyweightTrend", () => {
  it("averages the week and fits a weekly rate (losing 0.5 kg/week)", () => {
    const entries = Array.from({ length: 36 }, (_, i) => ({ date: day(i), weightKg: 80 + (i / 7) * 0.5 + (i % 2 ? 0.6 : -0.6) }));
    const t = bodyweightTrend(entries, day(0));
    expect(t.latest?.date).toBe(day(0));
    expect(t.perWeek!).toBeCloseTo(-0.5, 1);
    expect(t.change28!).toBeCloseTo(-2, 0);
  });
  it("needs a couple of weeks before showing a rate", () => {
    const t = bodyweightTrend([{ date: day(2), weightKg: 80 }, { date: day(0), weightKg: 79 }], day(0));
    expect(t).toMatchObject({ perWeek: null, change28: null, avg7: 79.5 });
    expect(bodyweightTrend([], day(0))).toMatchObject({ latest: null, avg7: null });
  });
});

describe("relativeStrength", () => {
  it("divides each lift's best recent e1RM by bodyweight, ignoring warm-ups and old sets", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const s = (exerciseId: string, weightKg: number, reps: number, daysAgo: number, isWarmup = false): SetEntry => ({ id: `${exerciseId}${weightKg}${daysAgo}`, sessionId: "x", exerciseId, setIndex: 0, weightKg, reps, rpe: null, isWarmup, note: null, createdAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString() });
    const r = relativeStrength([s("sq", 140, 1, 3), s("sq", 200, 1, 3, true), s("sq", 180, 1, 90), s("bp", 100, 1, 5)], [{ id: "sq", name: "Squat", category: "lower", equipment: null, incrementKg: null, ownerId: null }, { id: "bp", name: "Bench", category: "upper", equipment: null, incrementKg: null, ownerId: null }], 80, cfg, now);
    expect(r.map((x) => [x.exercise, Number(x.ratio.toFixed(2))])).toEqual([["Squat", 1.75], ["Bench", 1.25]]);
  });
});
