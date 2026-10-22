import { describe, expect, it } from "vitest";
import { libraryExercises } from "@/lib/store/seed";
import { editDistance, findExercise, matchExercise } from "./match";

const lib = libraryExercises();
const name = (q: string) => matchExercise(q, lib)?.name ?? null;

describe("editDistance", () => {
  it("counts edits, with a swap as one", () => {
    expect(editDistance("curl", "curl")).toBe(0);
    expect(editDistance("crul", "curl")).toBe(1);
    expect(editDistance("bench", "bnch")).toBe(1);
    expect(editDistance("squat", "squats")).toBe(1);
    expect(editDistance("deadlift", "dedlfit", 2)).toBe(2);
    expect(editDistance("bench press", "leg curl", 2)).toBe(3); // capped at max + 1
  });
});

describe("findExercise", () => {
  it("prefers exact, then synonyms, then looser matches", () => {
    expect(findExercise("Bench Press", lib)?.via).toBe("exact");
    expect(findExercise("rdl", lib)).toMatchObject({ via: "alias", item: { name: "Romanian Deadlift" } });
    expect(findExercise("ohp", lib, { ohp: "Overhead Press" })?.via).toBe("config");
  });
  it("forgives small typos", () => {
    expect(name("bench pres")).toBe("Bench Press");
    expect(name("romanian dedlift")).toBe("Romanian Deadlift");
    expect(name("overhaed press")).toBe("Overhead Press");
    expect(findExercise("lat pulldwon", lib)?.via).toBe("typo");
  });
  it("doesn't guess on short words or far-off names", () => {
    expect(name("xyz")).toBeNull();
    expect(name("moon squat")).toBeNull();
  });
  it("gives up on a tie instead of guessing", () => {
    const items = [{ name: "Cable Row" }, { name: "Cable Raw" }];
    expect(matchExercise("cable rxw", items)).toBeNull();
  });
});
