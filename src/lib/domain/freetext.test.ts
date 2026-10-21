import { describe, expect, it } from "vitest";
import { parseFreeText } from "./freetext";

const ok = (input: string) => {
  const r = parseFreeText(input);
  if (!r.ok) throw new Error(`${input} → ${r.reason}`);
  return { exercise: r.exercise, n: r.sets.length, w: r.sets[0].weight, r: r.sets[0].reps, unit: r.sets[0].unit, rpe: r.sets[0].rpe };
};

describe("parseFreeText: valid", () => {
  it("sets×reps first, weight last", () => expect(ok("4x8 bench 185")).toMatchObject({ exercise: "bench", n: 4, r: 8, w: 185 }));
  it("weight then sets×reps", () => expect(ok("bench 185 4x8")).toMatchObject({ exercise: "bench", n: 4, r: 8, w: 185 }));
  it("@ weight", () => expect(ok("squat 3x5 @ 225")).toMatchObject({ exercise: "squat", n: 3, r: 5, w: 225 }));
  it("'at' weight", () => expect(ok("squat 3x5 at 225")).toMatchObject({ n: 3, r: 5, w: 225 }));
  it("weight×reps single set", () => expect(ok("deadlift 405x3")).toMatchObject({ exercise: "deadlift", n: 1, w: 405, r: 3 }));
  it("spaced weight × reps", () => expect(ok("deadlift 405 x 3")).toMatchObject({ n: 1, w: 405, r: 3 }));
  it("kg suffix", () => expect(ok("bench 100kg 3x5")).toMatchObject({ n: 3, w: 100, unit: "kg" }));
  it("kg suffix with @", () => expect(ok("squat 3x5 @ 140 kg")).toMatchObject({ w: 140, unit: "kg" }));
  it("no unit → null (use the user's unit)", () => expect(ok("bench 185 4x8").unit).toBeNull());
  it("'sets of'", () => expect(ok("squat 3 sets of 5 at 225")).toMatchObject({ n: 3, r: 5, w: 225 }));
  it("multi-word names", () => expect(ok("romanian deadlift 3x8 @ 185")).toMatchObject({ exercise: "romanian deadlift" }));
  it("existing shorthand still works", () => expect(ok("bench 185x5x3")).toMatchObject({ n: 3, w: 185, r: 5 }));
  it("rep lists still work", () => expect(parseFreeText("bench 185 5,5,4")).toMatchObject({ ok: true, sets: [{ reps: 5 }, { reps: 5 }, { reps: 4 }] }));
  it("@ after a weight is RPE", () => expect(ok("bench 185 3x5 @8")).toMatchObject({ w: 185, rpe: 8 }));
  it("no name → null exercise", () => expect(ok("3x5 @ 225").exercise).toBeNull());
  it("decimals", () => expect(ok("ohp 3x5 @ 42.5kg")).toMatchObject({ w: 42.5, unit: "kg" }));
});

describe("parseFreeText: ambiguous / missing", () => {
  it("sets×reps without a weight", () => expect(parseFreeText("squat 5x5 sets")).toMatchObject({ ok: true, sets: [{ weight: 5, reps: 5 }] })); // read as weight×reps
  it("two loose numbers", () => expect(parseFreeText("bench 185 225")).toEqual({ ok: false, reason: "unclear" }));
  it("'3 sets of 5' with no weight", () => expect(parseFreeText("squat 3 sets of 5")).toEqual({ ok: false, reason: "missing-weight" }));
  it("a weight but no reps", () => expect(parseFreeText("bench 185")).toEqual({ ok: false, reason: "unclear" }));
  it("@ with two weights", () => expect(parseFreeText("bench 185 3x5 @ 225")).toEqual({ ok: false, reason: "unclear" }));
  it("too many sets", () => expect(parseFreeText("50x5 bench 135")).toEqual({ ok: false, reason: "too-many-sets" }));
});

describe("parseFreeText: garbage", () => {
  it("empty", () => expect(parseFreeText("   ")).toEqual({ ok: false, reason: "empty" }));
  it("words only", () => expect(parseFreeText("did some bench today")).toEqual({ ok: false, reason: "no-numbers" }));
  it("questions", () => expect(parseFreeText("how much should I bench next week?")).toMatchObject({ ok: false }));
  it("zero reps", () => expect(parseFreeText("bench 185x0")).toMatchObject({ ok: false }));
  it("nonsense numbers", () => expect(parseFreeText("1 2 3 4")).toMatchObject({ ok: false }));
});
