import { describe, expect, it } from "vitest";
import { defaultConfig as cfg } from "@/config/app.config";
import { detectPlateaus } from "./plateau";
import type { Exercise, SetEntry } from "./types";

const NOW = new Date("2026-10-21T12:00:00Z");
const ex: Exercise[] = [{ id: "bp", name: "Bench Press", category: "upper", equipment: "barbell", incrementKg: null, ownerId: null }];
let n = 0;
const set = (weeksAgo: number, kg: number, reps = 5): SetEntry => ({
  id: `s${++n}`, sessionId: `w${weeksAgo}`, exerciseId: "bp", setIndex: 0, weightKg: kg, reps, rpe: null, isWarmup: false, note: null,
  createdAt: new Date(NOW.getTime() - (weeksAgo * 7 + 1) * 86_400_000).toISOString(),
});

describe("plateaus", () => {
  it("doesn't flag a lift that's still climbing", () => {
    expect(detectPlateaus([8, 7, 6, 5, 4, 3, 2, 1, 0].map((w, i) => set(w, 80 + i * 2.5)), ex, NOW, cfg)).toEqual([]);
  });
  it("flags a stall and escalates the advice the longer it lasts", () => {
    // Climbs to 90 kg, then `flat` more weeks at 90, up to this week.
    const climbThenFlat = (flat: number) => [...[2, 1, 0].map((k, i) => set(flat + k, 80 + i * 5)), ...Array.from({ length: flat }, (_, i) => set(flat - 1 - i, 90))];
    expect(detectPlateaus(climbThenFlat(2), ex, NOW, cfg)).toEqual([]); // 2 weeks isn't a plateau yet
    expect(detectPlateaus(climbThenFlat(3), ex, NOW, cfg)[0]).toMatchObject({ name: "Bench Press", weeks: 3, suggestion: "bump" });
    expect(detectPlateaus(climbThenFlat(4), ex, NOW, cfg)[0]).toMatchObject({ weeks: 4, suggestion: "rep-range" });
    expect(detectPlateaus(climbThenFlat(7), ex, NOW, cfg)[0]).toMatchObject({ weeks: 7, suggestion: "deload" });
  });
  it("ignores lifts you've stopped doing, and tiny noise doesn't count as a new best", () => {
    expect(detectPlateaus([10, 9, 8, 7, 6, 5].map((w) => set(w, 90)), ex, NOW, cfg)).toEqual([]); // last trained 5 weeks ago
    const noisy = [set(5, 100), set(4, 100.5), set(3, 100), set(2, 100.8), set(1, 100), set(0, 100.2)];
    expect(detectPlateaus(noisy, ex, NOW, cfg)[0]).toMatchObject({ weeks: 5 });
  });
});
