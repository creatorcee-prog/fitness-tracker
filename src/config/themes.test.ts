import { describe, expect, it } from "vitest";
import { contrastRatio, THEME_PRESETS, themeVars, type ColorMode } from "./themes";

/**
 * Every theme, in both modes, must be readable: WCAG AA 4.5:1 for text and
 * text-on-color (buttons, the highlight card), 3:1 for status colors used
 * on small badges and icons.
 */
const TEXT: [string, string][] = [
  ["text", "bg"], ["text", "surface"], ["text", "surface-2"], ["muted", "surface"], ["muted", "bg"],
  ["accent-text", "accent"], ["highlight-text", "highlight"], ["link", "bg"], ["link", "surface"], ["seg-thumb-text", "seg-thumb"],
];
const STATUS: [string, string][] = [["good", "surface"], ["bad", "surface"], ["pr", "surface"]];

describe("themes", () => {
  for (const [id, preset] of Object.entries(THEME_PRESETS)) {
    for (const mode of ["dark", "light"] as ColorMode[]) {
      it(`${id} (${mode}) is readable`, () => {
        const v = themeVars(preset, mode);
        const fails = [
          ...TEXT.map(([a, b]) => [a, b, 4.5] as const),
          ...STATUS.map(([a, b]) => [a, b, 3] as const),
        ].flatMap(([a, b, min]) => {
          const r = contrastRatio(v[a], v[b]);
          return r == null || r < min ? [`${a} on ${b}: ${r?.toFixed(2)} (needs ${min})`] : [];
        });
        expect(fails).toEqual([]);
      });
    }
  }
  it("Ember is the default and every theme has both modes", async () => {
    const { defaultConfig } = await import("./app.config");
    expect(defaultConfig.theme.preset).toBe("ember");
    for (const p of Object.values(THEME_PRESETS)) expect(Object.keys(p.alt).length).toBeGreaterThan(10);
  });
});
