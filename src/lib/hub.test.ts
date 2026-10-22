import { beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "@/config/app.config";
import { FakeData } from "@/lib/bot/testing";
import { toKg } from "@/lib/domain/units";
import { hubAuthorized, hubEnvFromProcess, hubSummary, type HubEnv } from "./hub";

const NOW = new Date("2026-10-21T17:00:00Z");
const env: HubEnv = { secret: "s3cret-value", userId: "u1" };
let data: FakeData;

beforeEach(() => {
  data = new FakeData();
});

describe("hub link", () => {
  it("reads its settings from the environment", () => {
    expect(hubEnvFromProcess({ HUB_SECRET: "a", HUB_USER_ID: "b" } as unknown as NodeJS.ProcessEnv)).toEqual({ secret: "a", userId: "b" });
    expect(hubEnvFromProcess({} as NodeJS.ProcessEnv)).toEqual({ secret: "", userId: "" });
  });

  it("accepts only the exact bearer token", () => {
    expect(hubAuthorized("Bearer s3cret-value", env)).toBe(true);
    expect(hubAuthorized("Bearer s3cret-valuf", env)).toBe(false);
    expect(hubAuthorized("Bearer s3cret", env)).toBe(false);
    expect(hubAuthorized("s3cret-value", env)).toBe(false);
    expect(hubAuthorized(null, env)).toBe(false);
  });

  it("stays shut until both settings are present", () => {
    expect(hubAuthorized("Bearer ", { secret: "", userId: "u1" })).toBe(false);
    expect(hubAuthorized("Bearer s3cret-value", { secret: "s3cret-value", userId: "" })).toBe(false);
  });

  it("summarizes the linked account's training with James's own context", async () => {
    const s = await data.startSession("u1", "split-ppl-d0", new Date(NOW.getTime() - 86_400_000));
    await data.addSet("u1", { sessionId: s.id, exerciseId: "ex-bench", setIndex: 0, weightKg: toKg(185, "lb"), reps: 5, rpe: null, isWarmup: false, note: null, createdAt: new Date(NOW.getTime() - 86_000_000).toISOString() });
    await data.finishSession("u1", s.id, new Date(NOW.getTime() - 82_800_000));
    const r = await hubSummary(data, defaultConfig, env, NOW);
    expect(r?.coach).toBe("James");
    expect(r?.summary).toContain("Units: lb");
    expect(r?.summary).toContain("Bench Press 185x5");
  });

  it("returns null when HUB_USER_ID matches no account", async () => {
    expect(await hubSummary(data, defaultConfig, { ...env, userId: "nobody" }, NOW)).toBeNull();
  });
});
