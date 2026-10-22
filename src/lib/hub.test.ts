import { beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "@/config/app.config";
import { FakeData } from "@/lib/bot/testing";
import { toKg } from "@/lib/domain/units";
import { hubAuthorized, hubCommand, hubEnvFromProcess, hubSummary, type HubEnv } from "./hub";

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

  it("logs a set for the linked account through the bot's Confirm flow", async () => {
    const r = await hubCommand(data, defaultConfig, env, NOW, "https://app.test", { command: "log", options: { sets: "4x8 bench 185" } });
    expect(r.content).toContain("**Bench Press**: 4 × 8 reps @ 185 lb");
    expect(data.sets).toHaveLength(0);
    const confirm = r.buttons!.find((b) => b.id.startsWith("lc:"))!;
    const saved = await hubCommand(data, defaultConfig, env, NOW, "https://app.test", { component: confirm.id });
    expect(saved.content).toContain("✅ **Bench Press**");
    expect(data.sets).toHaveLength(4);
    const undo = saved.buttons!.find((b) => b.id.startsWith("undo:"))!;
    await hubCommand(data, defaultConfig, env, NOW, "https://app.test", { component: undo.id });
    expect(data.sets).toHaveLength(3);
  });

  it("acts as HUB_USER_ID whatever the Discord lookup would say", async () => {
    data.users[0].discordId = "someone-else";
    const r = await hubCommand(data, defaultConfig, env, NOW, "https://app.test", { command: "today" });
    expect(r.content).not.toContain("I don't know you yet");
  });

  it("refuses commands and buttons that aren't for training", async () => {
    expect((await hubCommand(data, defaultConfig, env, NOW, "x", { command: "announce" })).content).toContain("isn't available");
    expect((await hubCommand(data, defaultConfig, env, NOW, "x", { command: "leaderboard" })).content).toContain("isn't available");
    expect((await hubCommand(data, defaultConfig, env, NOW, "x", { component: "ci:snooze:r1" })).content).toContain("isn't available");
  });
});

