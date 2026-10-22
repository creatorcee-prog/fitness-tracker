import { describe, expect, it } from "vitest";
import { parseShorthand } from "./shorthand";
import { spokenToShorthand } from "./spoken";

describe("spokenToShorthand", () => {
  const cases: [string, string][] = [
    ["185 for 5", "185x5"],
    ["185 by 5", "185x5"],
    ["185 times 5 reps", "185x5"],
    ["Bench 185 pounds for 5 reps.", "bench 185lb x5"],
    ["3 sets of 5 at 185", "185x5x3"],
    ["5 reps at 80 kilos", "80kg x5"],
    ["one eighty five by five", "185x5"],
    ["two hundred twenty five for three", "225x3"],
    ["225 for 5 at RPE 8", "225x5@8"],
    ["squat 225 for 5 for 3 sets", "squat 225x5x3"],
    ["135 for eight", "135x8"],
  ];
  for (const [heard, want] of cases) {
    it(`"${heard}" → ${want}`, () => {
      const got = spokenToShorthand(heard);
      expect(got).toBe(want);
      expect(parseShorthand(got!)).not.toBeNull();
    });
  }
  it("returns null for things that aren't a set", () => {
    expect(spokenToShorthand("what's for dinner")).toBeNull();
    expect(spokenToShorthand("")).toBeNull();
  });
});
