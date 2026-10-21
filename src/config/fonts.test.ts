import { describe, expect, it } from "vitest";
import { FONTS, fontById, googleFontsUrl } from "./fonts";

describe("fonts", () => {
  it("loads only the chosen family, or nothing for system/theme fonts", () => {
    expect(googleFontsUrl([fontById("lexend")])).toBe("https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap");
    expect(googleFontsUrl([fontById("system")])).toBeNull();
    expect(googleFontsUrl([fontById("theme")])).toBeNull();
    expect(fontById("nope").id).toBe("theme");
  });
  it("previews fetch only the letters shown", () => {
    expect(googleFontsUrl(FONTS, "Ab 1")).toContain("&text=Ab%201");
  });
  it("every font has a fallback stack", () => {
    for (const f of FONTS) if (f.id !== "theme") expect(f.stack).toMatch(/sans-serif|monospace/);
  });
});
