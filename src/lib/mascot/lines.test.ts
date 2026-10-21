import { describe, expect, it } from "vitest";
import { fill, LINES, MOOD, pickLine, PRIORITY, type MascotEvent } from "./lines";

const KNOWN = new Set(["name", "day", "lift", "weight", "reps", "goal", "streak", "days", "next"]);

describe("mascot lines", () => {
  it("every event has lines, a mood and a priority", () => {
    for (const e of Object.keys(LINES) as MascotEvent[]) {
      expect(LINES[e].length).toBeGreaterThan(0);
      expect(MOOD[e]).toBeTruthy();
      expect(PRIORITY[e]).toBeGreaterThan(0);
    }
  });
  it("only uses known placeholders", () => {
    for (const lines of Object.values(LINES)) for (const l of lines) for (const m of l.text.matchAll(/\{(\w+)\}/g)) expect(KNOWN.has(m[1])).toBe(true);
  });
  it("fills placeholders", () => {
    expect(fill("{lift} PR, {weight} × {reps}!", { lift: "Bench Press", weight: "190 lb", reps: 5 })).toBe("Bench Press PR, 190 lb × 5!");
  });
  it("falls back gracefully for missing values", () => {
    expect(fill("Evening, {name}. {day} is up.", {})).toBe("Evening, friend. Training is up.");
  });
  it("avoids recently used lines", () => {
    const all = LINES.pr.map((l) => l.text);
    const recent = all.slice(0, -1);
    expect(pickLine("pr", recent, () => 0).text).toBe(all[all.length - 1]);
  });
  it("still answers when everything was used recently", () => {
    expect(pickLine("comeback", LINES.comeback.map((l) => l.text), () => 0.5).text).toBeTruthy();
  });
  it("PRs and goals outrank greetings", () => {
    expect(PRIORITY.goal_hit).toBeGreaterThan(PRIORITY.pr);
    expect(PRIORITY.pr).toBeGreaterThan(PRIORITY.morning);
  });
});
