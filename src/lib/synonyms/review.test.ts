import { describe, expect, it } from "vitest";
import { suggestPrompt, validateSuggestions, type LibLift } from "./review";

const lib: LibLift[] = [
  { id: "a", name: "Lying Triceps Extension", aliases: ["skull crusher"] },
  { id: "b", name: "Bench Press", aliases: ["bp"] },
];

describe("validateSuggestions", () => {
  it("keeps only safe, new pairs for real library lifts", () => {
    const out = validateSuggestions(
      {
        pairs: [
          { alias: "Skulls", exercise: "Lying Triceps Extension" },
          { alias: "skull crusher", exercise: "Lying Triceps Extension" }, // already a synonym
          { alias: "bench press", exercise: "Lying Triceps Extension" }, // a lift's name
          { alias: "flat bench", exercise: "Flat Bench" }, // not a library lift
          { alias: "x", exercise: "Bench Press" }, // too short
          { alias: "rejected one", exercise: "Bench Press" },
          { alias: "approved one", exercise: "Bench Press" },
          { alias: "Skulls", exercise: "Bench Press" }, // duplicate alias: first wins
          "junk",
        ],
      },
      lib,
      new Set(["approved one"]),
      new Set(["rejected one|b"]),
    );
    expect(out).toEqual([{ alias: "skulls", exerciseId: "a", exercise: "Lying Triceps Extension", why: "ai" }]);
  });
  it("survives garbage", () => {
    expect(validateSuggestions(null, lib, new Set(), new Set())).toEqual([]);
    expect(validateSuggestions({ pairs: "no" }, lib, new Set(), new Set())).toEqual([]);
  });
});

describe("suggestPrompt", () => {
  it("lists the library so the model uses exact names", () => {
    expect(suggestPrompt("misses", ["skulls"], lib)).toContain("Lying Triceps Extension\nBench Press");
  });
});
