import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/config/app.config";
import { deepMerge } from "@/config/runtime";
import { e1rm } from "./e1rm";
import { percentageGains } from "./gain";
import { platesPerSide } from "./plates";
import { parseRepRange, prefillFor } from "./progression";
import { currentRecords, prsForSet, replayPRs } from "./prs";
import { parseShorthand } from "./shorthand";
import { advance, getToday, weekdayIn } from "./split";
import type { Session, SetEntry, Split } from "./types";
import { fromKg, toKg } from "./units";

const cfg = defaultConfig;

let n = 0;
function set(p: Partial<SetEntry> & { weightKg: number; reps: number; createdAt: string }): SetEntry {
  return { id: `s${++n}`, sessionId: "x", exerciseId: "bench", setIndex: 0, rpe: null, isWarmup: false, note: null, ...p };
}

describe("e1rm", () => {
  it("uses Epley by default", () => expect(e1rm(100, 5)).toBeCloseTo(116.667, 2));
  it("returns weight for a single", () => expect(e1rm(100, 1, "brzycki")).toBe(100));
  it("supports other formulas", () => expect(e1rm(100, 5, "brzycki")).toBeCloseTo(112.5, 2));
});

describe("shorthand", () => {
  it("parses WxRxS", () => expect(parseShorthand("185x5x3")?.sets).toHaveLength(3));
  it("parses a rep list", () => expect(parseShorthand("185 5,5,4")?.sets.map((s) => s.reps)).toEqual([5, 5, 4]));
  it("parses multiple sets", () => expect(parseShorthand("185x5, 195x3")?.sets.map((s) => s.weight)).toEqual([185, 195]));
  it("parses rpe and unit", () => expect(parseShorthand("80kg x5 @8")?.sets[0]).toEqual({ weight: 80, reps: 5, rpe: 8, unit: "kg" }));
  it("parses an exercise prefix", () => {
    const r = parseShorthand("bench press 185x5");
    expect(r?.exercise).toBe("bench press");
    expect(r?.sets[0].reps).toBe(5);
  });
  it("rejects junk", () => expect(parseShorthand("hello")).toBeNull());
});

describe("PRs", () => {
  const sessions: Session[] = [
    { id: "a", splitDayId: null, startedAt: "2026-01-01T10:00:00Z", finishedAt: "2026-01-01T11:00:00Z", source: "web" },
    { id: "b", splitDayId: null, startedAt: "2026-01-08T10:00:00Z", finishedAt: "2026-01-08T11:00:00Z", source: "web" },
  ];
  const sets = [
    set({ sessionId: "a", weightKg: 20, reps: 10, isWarmup: true, createdAt: "2026-01-01T10:00:00Z" }),
    set({ sessionId: "a", weightKg: 100, reps: 5, createdAt: "2026-01-01T10:05:00Z" }),
    set({ sessionId: "b", weightKg: 100, reps: 6, createdAt: "2026-01-08T10:05:00Z" }),
    set({ sessionId: "b", weightKg: 90, reps: 12, createdAt: "2026-01-08T10:10:00Z" }),
  ];
  const events = replayPRs(sets, sessions, cfg);

  it("ignores warm-ups", () => expect(events.some((e) => e.setId === sets[0].id)).toBe(false));
  it("marks the first set as baseline only", () => expect(prsForSet(events, sets[1].id)).toEqual([]));
  it("detects reps-at-weight and e1RM PRs", () => expect(prsForSet(events, sets[2].id).sort()).toEqual(["e1rm", "reps_at_weight"]));
  it("excludes high-rep sets from e1RM PRs", () => expect(prsForSet(events, sets[3].id)).toEqual(["reps_at_weight"]));
  it("tracks session volume", () => expect(currentRecords(events).session_volume?.sessionId).toBe("b"));
  it("rebuilds after a delete", () => {
    const after = replayPRs(sets.filter((s) => s.id !== sets[1].id), sessions, cfg);
    expect(prsForSet(after, sets[2].id)).toEqual([]); // now the baseline
  });
});

describe("split", () => {
  const split: Split = {
    id: "sp", name: "PPL", mode: "rotation", isActive: true,
    days: [0, 1, 2].map((p) => ({ id: `d${p}`, splitId: "sp", position: p, name: ["Push", "Pull", "Legs"][p], weekday: p === 0 ? 1 : null, exercises: [] })),
  };
  it("defaults to the first day", () => expect(getToday(split, null, new Date(), "UTC")).toMatchObject({ kind: "day", day: { name: "Push" } }));
  it("advances and wraps", () => {
    let st = advance(split, null, split.days[2], new Date(), true);
    expect(st.nextPosition).toBe(0);
    st = advance(split, st, split.days[0], new Date(), true);
    expect(getToday(split, st, new Date(), "UTC")).toMatchObject({ day: { name: "Pull" } });
  });
  it("uses the weekday in the user's timezone in weekly mode", () => {
    const weekly = { ...split, mode: "weekly" as const };
    // 2026-10-26 03:00 UTC is Monday in UTC but Sunday in Los Angeles.
    const t = new Date("2026-10-26T03:00:00Z");
    expect(weekdayIn(t, "America/Los_Angeles")).toBe(0);
    expect(getToday(weekly, null, t, "UTC")).toMatchObject({ day: { name: "Push" } });
    expect(getToday(weekly, null, t, "America/Los_Angeles")).toEqual({ kind: "rest" });
  });
});

describe("progression", () => {
  const step = toKg(5, "lb");
  it("parses ranges", () => expect(parseRepRange("5-8")).toEqual({ min: 5, max: 8 }));
  it("jumps when every set hit the top", () => {
    const last = [0, 1].map((i) => set({ setIndex: i, weightKg: toKg(185, "lb"), reps: 8, createdAt: "2026-01-01T00:00:00Z" }));
    const p = prefillFor(0, last, "5-8", "upper", "lb", cfg, step)!;
    expect(fromKg(p.weightKg, "lb")).toBeCloseTo(190, 5);
    expect(p.reason).toBe("progression");
  });
  it("holds after a missed rep", () => {
    const last = [set({ weightKg: 100, reps: 4, createdAt: "2026-01-01T00:00:00Z" })];
    expect(prefillFor(0, last, "5-8", "upper", "lb", cfg, step)).toMatchObject({ weightKg: 100, reason: "hold-missed" });
  });
  it("respects the progression toggle", () => {
    const off = deepMerge(cfg, { progression: { enabled: false } });
    const last = [set({ weightKg: 100, reps: 8, createdAt: "2026-01-01T00:00:00Z" })];
    expect(prefillFor(0, last, "5-8", "upper", "lb", off, step)?.reason).toBe("last-time");
  });
});

describe("percentage gain", () => {
  it("compares the recent best against the first log", () => {
    const sets = [
      set({ weightKg: 100, reps: 1, createdAt: "2026-01-01T10:00:00Z" }),
      set({ weightKg: 110, reps: 1, createdAt: "2026-03-01T10:00:00Z" }),
    ];
    const g = percentageGains(sets, new Date("2026-03-05T00:00:00Z"), cfg).find((x) => x.baselineId === "first")!;
    expect(g.percent).toBeCloseTo(10, 5);
  });
});

describe("plates", () => {
  it("loads 225 with two 45s per side", () => expect(platesPerSide(225, 45, cfg.plates.available.lb)).toEqual({ plates: [45, 45], remainder: 0 }));
  it("reports a remainder", () => expect(platesPerSide(226, 45, cfg.plates.available.lb).remainder).toBe(1));
});

describe("config", () => {
  it("deep merges overrides", () => {
    const c = deepMerge(cfg, { restTimer: { defaultSeconds: 30 } });
    expect(c.restTimer.defaultSeconds).toBe(30);
    expect(c.restTimer.autoStart).toBe(true);
  });
});

import { weekStart, weeklyStreak } from "./stats";

describe("stats", () => {
  const mk = (iso: string): Session => ({ id: iso, splitDayId: null, startedAt: iso, finishedAt: iso, source: "web" });
  it("finds the Monday week start", () => expect(weekStart(new Date(2026, 9, 21, 15), 1).getDate()).toBe(19));
  it("counts consecutive weeks hitting the target", () => {
    const sessions = [
      mk(new Date(2026, 9, 6).toISOString()), mk(new Date(2026, 9, 8).toISOString()),
      mk(new Date(2026, 9, 13).toISOString()), mk(new Date(2026, 9, 15).toISOString()),
      mk(new Date(2026, 9, 20).toISOString()),
    ];
    // This week (from Oct 19) has 1 of 2 → doesn't count yet; previous two weeks do.
    expect(weeklyStreak(sessions, new Date(2026, 9, 21, 12), 1, 2)).toBe(2);
  });
});

import { matchExercise } from "./match";

describe("matchExercise", () => {
  const items = [{ name: "Overhead Press" }, { name: "Bench Press" }, { name: "Romanian Deadlift" }, { name: "Deadlift" }];
  it("matches initials", () => expect(matchExercise("bp", items)?.name).toBe("Bench Press"));
  it("matches aliases", () => expect(matchExercise("OHP", items, { ohp: "Overhead Press" })?.name).toBe("Overhead Press"));
  it("prefers exact", () => expect(matchExercise("deadlift", items)?.name).toBe("Deadlift"));
  it("matches prefix", () => expect(matchExercise("bench", items)?.name).toBe("Bench Press"));
  it("returns null", () => expect(matchExercise("curl", items)).toBeNull());
});
