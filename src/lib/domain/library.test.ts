import { describe, expect, it } from "vitest";
import { LIBRARY } from "./library";
import { matchExercise } from "./match";

describe("exercise library", () => {
  it("has unique names, and no synonym points at two exercises", () => {
    const seen = new Map<string, string>();
    for (const e of LIBRARY) {
      for (const key of [e.name, ...e.aliases].map((x) => x.toLowerCase())) {
        expect(seen.get(key) ?? e.name, `"${key}" is used by ${seen.get(key)} and ${e.name}`).toBe(e.name);
        seen.set(key, e.name);
      }
    }
    expect(LIBRARY.length).toBeGreaterThan(100);
  });
  it("matches what people type through synonyms", () => {
    const m = (q: string) => matchExercise(q, LIBRARY)?.name;
    expect(m("rdl")).toBe("Romanian Deadlift");
    expect(m("Stiff Leg Deadlift")).toBe("Romanian Deadlift");
    expect(m("pec deck")).toBe("Chest Fly Machine");
    expect(m("R Pec Deck")).toBe("Reverse Pec Deck");
    expect(m("Machine Lat. Raise")).toBe("Machine Lateral Raise");
    expect(m("dead-hang")).toBe("Dead Hang");
    expect(m("ohp")).toBe("Overhead Press");
  });
});
