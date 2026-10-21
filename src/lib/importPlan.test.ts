import { describe, expect, it } from "vitest";
import type { Exercise } from "./domain/types";
import { planImport } from "./importPlan";
import { seedSplit, SEED_EXERCISES } from "./store/seed";

let n = 0;
const newId = () => `new-${++n}`;
const local = SEED_EXERCISES.map((e) => ({ ...e, ownerId: null }));
const remote: Exercise[] = [{ id: "uuid-bench", name: "Bench Press", category: "upper", equipment: "barbell", incrementKg: null, ownerId: null }];

const data = {
  exercises: [...local, { id: "custom-1", name: "Zercher Squat", category: "lower" as const, equipment: "barbell", incrementKg: null, ownerId: "local-user" }],
  splits: [seedSplit()],
  sessions: [
    { id: "s1", splitDayId: "split-ppl-d0", startedAt: "2026-10-01T18:00:00.000Z", finishedAt: "2026-10-01T19:00:00.000Z", source: "web" as const },
    { id: "s2", splitDayId: null, startedAt: "2026-10-02T18:00:00.000Z", finishedAt: null, source: "web" as const },
  ],
  sets: [
    { id: "a", sessionId: "s1", exerciseId: "ex-bench", setIndex: 0, weightKg: 80, reps: 5, rpe: null, isWarmup: false, note: null, createdAt: "2026-10-01T18:10:00.000Z" },
    { id: "b", sessionId: "s2", exerciseId: "custom-1", setIndex: 0, weightKg: 60, reps: 5, rpe: null, isWarmup: false, note: null, createdAt: "2026-10-02T18:20:00.000Z" },
  ],
};

describe("planImport", () => {
  const plan = planImport(data, { exercises: remote, sessionStarts: new Set(), hasActiveSplit: false }, newId);

  it("matches exercises by name and creates missing ones", () => {
    expect(plan.sets[0].exerciseId).toBe("uuid-bench");
    expect(plan.newExercises.map((e) => e.name)).toContain("Zercher Squat");
    expect(plan.newExercises.map((e) => e.name)).not.toContain("Bench Press");
  });
  it("gives everything fresh ids and remaps references", () => {
    const day = plan.splits[0].days[0];
    expect(day.id).toMatch(/^new-/);
    expect(day.splitId).toBe(plan.splits[0].id);
    expect(plan.sessions[0].splitDayId).toBe(day.id);
    expect(plan.sets[0].sessionId).toBe(plan.sessions[0].id);
  });
  it("closes unfinished sessions", () => expect(plan.sessions[1].finishedAt).toBe("2026-10-02T18:20:00.000Z"));
  it("keeps the account's active split", () => {
    const p = planImport(data, { exercises: remote, sessionStarts: new Set(), hasActiveSplit: true }, newId);
    expect(p.splits[0].isActive).toBe(false);
  });
  it("skips sessions that were already imported", () => {
    const p = planImport(data, { exercises: remote, sessionStarts: new Set(["2026-10-01T18:00:00.000Z"]), hasActiveSplit: false }, newId);
    expect(p.skippedSessions).toBe(1);
    expect(p.sessions).toHaveLength(1);
    expect(p.sets).toHaveLength(1);
  });
});
