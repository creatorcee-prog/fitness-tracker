import { describe, expect, it } from "vitest";
import { defaultConfig as cfg } from "@/config/app.config";
import { fromKg } from "@/lib/domain/units";
import { LocalStore } from "@/lib/store/local";
import { applyAction, describeAction, extractActions, validateAction, type ApplyDeps } from "./actions";

class Mem {
  m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
}

const NOW = new Date("2026-10-21T12:00:00Z");
async function setup() {
  const store = new LocalStore(cfg, new Mem());
  const profile = await store.getProfile();
  let patched: Record<string, unknown> = {};
  let n = 0;
  const deps: ApplyDeps = { store, cfg, profile, now: () => NOW, newId: () => `id-${++n}`, patchConfig: (p) => (patched = { ...patched, ...p }) };
  return { store, deps, patched: () => patched };
}

describe("validateAction", () => {
  it("accepts well-formed actions and drops unknown fields", () => {
    expect(validateAction({ type: "set_plan", day: "Push", lift: "Bench Press", sets: 4, reps: "6 - 8", evil: "x" })).toEqual({ type: "set_plan", day: "Push", lift: "Bench Press", sets: 4, reps: "6-8" });
    expect(validateAction({ type: "add_goal", goal: "sessions_per_week", target: 4 })).toEqual({ type: "add_goal", goal: "sessions_per_week", target: 4 });
  });
  it("rejects anything out of bounds or unknown", () => {
    for (const bad of [
      null, "x", { type: "delete_account" }, { type: "set_plan", day: "Push", lift: "Bench" },
      { type: "set_plan", day: "Push", lift: "Bench", sets: 50 }, { type: "set_calorie_target", calories: 300 },
      { type: "set_unit", unit: "stone" }, { type: "add_goal", goal: "lift_e1rm", lift: "Bench", target: -5 },
      { type: "add_goal", goal: "lift_e1rm", lift: "Bench", target: 200, deadline: "soon" }, { type: "set_display_name", name: "x".repeat(60) },
    ]) expect(validateAction(bad)).toBeNull();
  });
});

describe("extractActions", () => {
  it("splits the reply from the actions block and validates each", () => {
    const r = extractActions('Sure, let\'s bump volume.\n<actions>[{"type":"set_plan","day":"Push","lift":"Bench Press","sets":4},{"type":"nuke"}]</actions>');
    expect(r.text).toBe("Sure, let's bump volume.");
    expect(r.actions).toEqual([{ type: "set_plan", day: "Push", lift: "Bench Press", sets: 4 }]);
  });
  it("ignores broken JSON and caps the count", () => {
    expect(extractActions("Hi <actions>[{oops</actions>")).toEqual({ text: "Hi", actions: [] });
    const many = JSON.stringify(Array.from({ length: 6 }, () => ({ type: "set_unit", unit: "kg" })));
    expect(extractActions(`<actions>${many}</actions>`).actions).toHaveLength(3);
  });
  it("leaves text without a block alone", () => expect(extractActions("Just advice.")).toEqual({ text: "Just advice.", actions: [] }));
});

describe("applyAction", () => {
  it("changes sets/reps on a split day, with undo", async () => {
    const { store, deps } = await setup();
    const split = (await store.listSplits())[0];
    await store.setActiveSplit(split.id);
    const day = split.days[0];
    const ex = (await store.listExercises()).find((e) => e.id === day.exercises[0].exerciseId)!;
    const undo = await applyAction({ type: "set_plan", day: day.name, lift: ex.name, sets: 5, reps: "3-5" }, deps);
    const after = (await store.listSplits())[0].days[0].exercises.find((x) => x.exerciseId === ex.id)!;
    expect(after).toMatchObject({ targetSets: 5, repRange: "3-5" });
    await undo();
    expect((await store.listSplits())[0].days[0].exercises.find((x) => x.exerciseId === ex.id)).toMatchObject({ targetSets: day.exercises[0].targetSets });
  });
  it("adds a goal in the user's unit and can undo it", async () => {
    const { store, deps } = await setup();
    const undo = await applyAction({ type: "add_goal", goal: "lift_e1rm", lift: "bench", target: 225 }, deps);
    const [g] = await store.listGoals();
    expect(g.type).toBe("lift_e1rm");
    expect(fromKg(g.targetValue, "lb")).toBeCloseTo(225, 5);
    await undo();
    expect(await store.listGoals()).toHaveLength(0);
  });
  it("explains unknown lifts and days instead of guessing", async () => {
    const { store, deps } = await setup();
    await store.setActiveSplit((await store.listSplits())[0].id);
    await expect(applyAction({ type: "add_exercise", day: "Arms Day", lift: "Bench Press", sets: 3, reps: "8-12" }, deps)).rejects.toThrow(/no day called/);
    await expect(applyAction({ type: "add_goal", goal: "lift_e1rm", lift: "Zercher Moonlift", target: 100 }, deps)).rejects.toThrow(/couldn't find a lift/);
  });
  it("sets nutrition, profile and config values", async () => {
    const { store, deps, patched } = await setup();
    await applyAction({ type: "set_calorie_target", calories: 2800, protein: 180 }, deps);
    expect(await store.getNutritionTargets()).toEqual({ calories: 2800, protein: 180 });
    await applyAction({ type: "set_unit", unit: "kg" }, deps);
    expect((await store.getProfile()).unit).toBe("kg");
    await applyAction({ type: "set_guided", on: true }, deps);
    expect(patched()).toEqual({ logging: { guided: true } });
  });
  it("describes actions from validated fields", () => {
    expect(describeAction({ type: "add_goal", goal: "lift_reps", lift: "Pull-up", target: 12, weight: 0 }, "lb")).toBe("Add goal: Pull-up 12 reps at bodyweight");
    expect(describeAction({ type: "set_plan", day: "Push", lift: "Bench Press", sets: 4, reps: "6-8" }, "lb")).toBe("Push: Bench Press → 4 sets × 6-8 reps");
  });
});
