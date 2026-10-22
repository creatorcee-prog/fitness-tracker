import { describe, expect, it } from "vitest";
import { matchExercise } from "./match";
import { normalizeAlias, rankLifts, withLearnedAliases } from "./synonyms";
import type { Exercise } from "./types";

const ex = (id: string, name: string, aliases?: string[]): Exercise => ({ id, name, category: "upper", equipment: null, incrementKg: null, ownerId: null, aliases });
const lifts = [ex("a", "Lying Triceps Extension", ["skull crusher"]), ex("b", "Bench Press", ["bp"]), ex("c", "Close-Grip Bench Press")];

describe("normalizeAlias", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeAlias("  Skull-Crushers! ")).toBe("skull crushers");
  });
});

describe("withLearnedAliases", () => {
  it("adds learned synonyms so matching finds them", () => {
    const out = withLearnedAliases(lifts, [{ alias: "Skulls", exerciseId: "a", source: "community" }]);
    expect(matchExercise("skulls", out)?.id).toBe("a");
  });
  it("lets your own correction override a built-in synonym, for you", () => {
    const out = withLearnedAliases(lifts, [{ alias: "bp", exerciseId: "c", source: "you" }]);
    expect(matchExercise("bp", out)?.id).toBe("c");
    expect(out.find((e) => e.id === "b")!.aliases).toEqual([]);
  });
  it("never lets community or approved synonyms take over a name or another lift's synonym", () => {
    const out = withLearnedAliases(lifts, [
      { alias: "bp", exerciseId: "c", source: "community" },
      { alias: "bench press", exerciseId: "c", source: "approved" },
    ]);
    expect(matchExercise("bp", out)?.id).toBe("b");
    expect(matchExercise("bench press", out)?.id).toBe("b");
  });
  it("prefers yours over approved over community for the same name", () => {
    const out = withLearnedAliases(lifts, [
      { alias: "cgbp", exerciseId: "b", source: "community" },
      { alias: "cgbp", exerciseId: "c", source: "you" },
    ]);
    expect(matchExercise("cgbp", out)?.id).toBe("c");
  });
});

describe("rankLifts", () => {
  it("puts typo'd words near the right lift", () => {
    expect(rankLifts("tricep extnsion", lifts)[0].id).toBe("a");
  });
});
