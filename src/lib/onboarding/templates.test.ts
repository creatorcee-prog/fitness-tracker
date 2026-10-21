import { describe, expect, it } from "vitest";
import { bmi, FREQUENCIES, STYLES } from "@/lib/domain/about";
import { LIBRARY } from "@/lib/domain/library";
import { starterTemplate, templateToSplit } from "./templates";

const library = LIBRARY.map((e, i) => ({ id: `e${i}`, name: e.name, category: e.category, equipment: e.equipment, incrementKg: null, ownerId: null, aliases: e.aliases }));

describe("starter plans", () => {
  it("every style × frequency gives a plan whose lifts all exist in the library", () => {
    for (const s of STYLES) for (const f of FREQUENCIES) {
      const t = starterTemplate(s.id, f.id);
      expect(t.days.length).toBeGreaterThan(0);
      for (const d of t.days) for (const [name] of d.lifts) expect(library.some((e) => e.name === name), `${t.name}: ${name}`).toBe(true);
    }
  });
  it("turns into an active rotation split", () => {
    let n = 0;
    const sp = templateToSplit(starterTemplate("strength", "gym-rat"), library, () => `id${++n}`);
    expect(sp).toMatchObject({ isActive: true, mode: "rotation", name: "Strength: Push / Pull / Legs" });
    expect(sp.days.map((d) => d.name)).toEqual(["Push", "Pull", "Legs"]);
    expect(sp.days[0].exercises[0]).toMatchObject({ order: 0, targetSets: 4, repRange: "4-6" });
  });
});

describe("BMI", () => {
  it("computes with bands, and refuses nonsense", () => {
    expect(bmi(180, 81)).toEqual({ value: 25, band: "overweight range" });
    expect(bmi(175, 70)).toEqual({ value: 22.9, band: "healthy range" });
    expect(bmi(null, 80)).toBeNull();
    expect(bmi(20, 80)).toBeNull();
  });
});
