import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "@/config/app.config";
import { advance, getToday } from "@/lib/domain/split";
import type { Exercise, FriendStatus, PREvent, Session, SetEntry, Split, SplitState } from "@/lib/domain/types";
import { toKg } from "@/lib/domain/units";
import { seedSplit, SEED_EXERCISES } from "@/lib/store/seed";
import type { NewSet } from "@/lib/store/types";
import type { BotData, BotUser } from "./data";
import { COMMANDS, toMessage, verifyDiscordRequest } from "./discord";
import { formatDuration, parseDuration } from "./duration";
import { handleAutocomplete, handleCommand, handleComponent, type BotContext } from "./handlers";

/** In-memory BotData that follows the same rules as the SQL functions. */
class FakeData implements BotData {
  users: (BotUser & { discordId: string })[] = [{ id: "u1", discordId: "d1", displayName: "Cee", unit: "lb", timezone: "UTC" }];
  exercises: Exercise[] = SEED_EXERCISES.map((e) => ({ ...e, ownerId: null }));
  split: Split | null = seedSplit();
  state: SplitState | null = null;
  sessions: Session[] = [];
  sets: SetEntry[] = [];
  prs: PREvent[] = [];
  friends: FriendStatus[] = [];
  n = 0;

  async findUser(discordId: string) {
    return this.users.find((u) => u.discordId === discordId) ?? null;
  }
  async getToday(_uid: string, now: Date) {
    return getToday(this.split, this.state, now, "UTC");
  }
  async getActiveSplit() {
    return this.split;
  }
  async listExercises() {
    return this.exercises;
  }
  async getOpenSession() {
    return this.sessions.find((s) => !s.finishedAt) ?? null;
  }
  async startSession(_uid: string, splitDayId: string | null, now: Date) {
    const s: Session = { id: `sess${++this.n}`, splitDayId, startedAt: now.toISOString(), finishedAt: null, source: "discord" };
    this.sessions.push(s);
    return s;
  }
  async finishSession(_uid: string, id: string, now: Date) {
    const s = this.sessions.find((x) => x.id === id && !x.finishedAt);
    if (!s) return;
    s.finishedAt = now.toISOString();
    const day = this.split?.days.find((d) => d.id === s.splitDayId);
    if (this.split && day && this.split.mode === "rotation") this.state = advance(this.split, this.state, day, now, true);
  }
  async setNextPosition(_uid: string, position: number) {
    this.state = { splitId: this.split!.id, nextPosition: position, lastCompletedAt: this.state?.lastCompletedAt ?? null };
  }
  async listSessions() {
    return this.sessions;
  }
  async listSets(_uid: string, f: { exerciseId?: string; sessionId?: string } = {}) {
    return this.sets.filter((s) => (!f.exerciseId || s.exerciseId === f.exerciseId) && (!f.sessionId || s.sessionId === f.sessionId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async getSet(_uid: string, id: string) {
    return this.sets.find((s) => s.id === id) ?? null;
  }
  async addSet(_uid: string, s: NewSet) {
    const row = { ...s, id: `set${++this.n}`, createdAt: s.createdAt ?? new Date().toISOString() };
    this.sets.push(row);
    return row;
  }
  async deleteSet(_uid: string, id: string) {
    this.sets = this.sets.filter((s) => s.id !== id);
  }
  async savePersonalRecords(_uid: string, exerciseId: string, events: PREvent[]) {
    this.prs = [...this.prs.filter((p) => p.exerciseId !== exerciseId), ...events];
  }
  async friendsToday() {
    return this.friends;
  }
}

let data: FakeData;
let clock: number;
const ctx = (discordUserId = "d1"): BotContext => ({ data, cfg: defaultConfig, now: new Date(clock), discordUserId, appUrl: "https://app.test" });
const run = async (name: string, opts: Record<string, string | number> = {}, who?: string) => {
  clock += 60_000;
  return handleCommand(ctx(who), name, opts);
};

beforeEach(() => {
  data = new FakeData();
  clock = Date.parse("2026-10-21T17:00:00Z");
});

describe("linking", () => {
  it("asks unknown Discord users to sign in", async () => {
    expect((await run("today", {}, "stranger")).content).toContain("Sign in at https://app.test");
  });
  it("lets anyone use /plates without an account", async () => {
    expect((await run("plates", { weight: 225 }, "stranger")).content).toContain("45 + 45 per side");
  });
});

describe("/today", () => {
  it("shows today's day with a Skip button", async () => {
    const r = await run("today");
    expect(r.content).toContain("Today: Push");
    expect(r.content).toContain("Bench Press");
    expect(r.buttons?.[0].id).toBe("skip");
  });
  it("handles no split", async () => {
    data.split = null;
    expect((await run("today")).content).toContain("No active split");
  });
});

describe("/log", () => {
  it("starts today's workout and logs shorthand", async () => {
    const r = await run("log", { sets: "bench 185x5x2" });
    expect(r.content).toContain("Bench Press");
    expect(r.content).toContain("185 × 5, 185 × 5 lb");
    expect(r.content).toContain("set 2/3");
    expect(r.content).toContain("Started Push");
    expect(r.content).toMatch(/Rest over <t:\d+:R>/);
    expect(data.sets).toHaveLength(2);
    expect(data.sessions[0].splitDayId).toBe("split-ppl-d0");
    expect(r.buttons?.map((b) => b.label)).toEqual(["Same again", "Undo last set"]);
  });
  it("uses aliases and remembers the last lift", async () => {
    await run("log", { sets: "ohp 95x8" });
    const r = await run("log", { sets: "95x7" });
    expect(r.content).toContain("Overhead Press");
  });
  it("converts kg", async () => {
    await run("log", { sets: "bench 100kg x5" });
    expect(data.sets[0].weightKg).toBe(100);
  });
  it("flags PRs", async () => {
    await run("log", { sets: "bench 185x5" });
    const r = await run("log", { sets: "bench 195x5" });
    expect(r.content).toContain("Heaviest");
    expect(r.content).toContain("e1RM PR");
  });
  it("rejects unknown lifts and junk", async () => {
    expect((await run("log", { sets: "zercher 135x5" })).content).toContain('No lift matches "zercher"');
    expect((await run("log", { sets: "lots of reps" })).content).toContain("Couldn't read that");
    expect((await run("log", { sets: "185x5" })).content).toContain("Which lift?");
  });
});

describe("buttons", () => {
  it("[Same again] repeats the set; [Undo] removes it", async () => {
    const r = await run("log", { sets: "bench 185x5" });
    clock += 60_000;
    const again = await handleComponent(ctx(), r.buttons![0].id);
    expect(again.content).toContain("set 2/3");
    expect(data.sets).toHaveLength(2);
    const undone = await handleComponent(ctx(), again.buttons![1].id);
    expect(undone.content).toContain("Removed");
    expect(data.sets).toHaveLength(1);
    expect((await handleComponent(ctx(), again.buttons![1].id)).content).toBe("Already removed.");
  });
  it("[Same again] refuses after the workout is finished", async () => {
    const r = await run("log", { sets: "bench 185x5" });
    await run("done");
    expect((await handleComponent(ctx(), r.buttons![0].id)).content).toContain("workout is finished");
  });
  it("buttons only act for the account that pressed them", async () => {
    const r = await run("log", { sets: "bench 185x5" });
    expect((await handleComponent(ctx("stranger"), r.buttons![1].id)).content).toContain("Sign in");
    expect(data.sets).toHaveLength(1);
  });
  it("[Skip] skips today", async () => {
    expect((await handleComponent(ctx(), "skip")).content).toContain("Skipped **Push**. Next up: **Pull**");
  });
});

describe("/undo, /done, /skip, /swap", () => {
  it("/undo removes the last set", async () => {
    await run("log", { sets: "bench 185x5x2" });
    expect((await run("undo")).content).toContain("Removed **Bench Press** 185 × 5");
    expect(data.sets).toHaveLength(1);
  });
  it("/done finishes, summarises and advances", async () => {
    await run("log", { sets: "bench 185x5x3" });
    const r = await run("done");
    expect(r.content).toContain("Push done");
    expect(r.content).toContain("3 sets");
    expect(r.content).toContain("Next up: **Pull**");
    expect((await run("today")).content).toContain("Today: Pull");
    expect((await run("done")).content).toContain("No workout in progress");
  });
  it("/skip refuses during a workout", async () => {
    await run("log", { sets: "bench 185x5" });
    expect((await run("skip")).content).toContain("Finish it with `/done`");
  });
  it("/swap moves the rotation pointer", async () => {
    expect((await run("swap", { day: "legs" })).content).toContain("Today is now **Legs**");
    expect((await run("today")).content).toContain("Today: Legs");
  });
  it("/swap in weekly mode starts that day", async () => {
    data.split = { ...data.split!, mode: "weekly" };
    expect((await run("swap", { day: "Pull" })).content).toContain("Started **Pull**");
    expect((await run("today")).content).toContain("Pull**, in progress");
  });
});

describe("/lift, /streak, /friends, /plates, /rest", () => {
  it("/lift shows last session and records", async () => {
    await run("log", { sets: "bench 185x5" });
    const r = await run("lift", { name: "bench" });
    expect(r.content).toContain("**Bench Press**");
    expect(r.content).toContain("185×5 lb");
    expect(r.content).toContain("Heaviest 185 lb × 5");
  });
  it("/streak counts this week", async () => {
    await run("log", { sets: "bench 185x5" });
    await run("done");
    expect((await run("streak")).content).toContain("This week: 1/3");
  });
  it("/friends lists status", async () => {
    data.friends = [
      { friendId: "f1", displayName: "Alex", kind: "day", dayName: "Pull", setsToday: 9, lastSessionAt: null },
      { friendId: "f2", displayName: "Sam", kind: "day", dayName: "Legs", setsToday: 0, lastSessionAt: null },
    ];
    const r = await run("friends");
    expect(r.content).toContain("1/2 lift days logged");
    expect(r.content).toContain("✅ Alex: Pull, logged (9 sets)");
    expect(r.content).toContain("⏳ Sam: Legs, not yet");
  });
  it("/plates handles kg and too-light", async () => {
    expect((await run("plates", { weight: 100, unit: "kg" })).content).toContain("25 + 15 per side");
    expect((await run("plates", { weight: 30 })).content).toContain("less than the bar");
  });
  it("/rest parses durations", async () => {
    expect((await run("rest", { time: "90" })).content).toContain("Rest 1:30");
    expect((await run("rest", { time: "nope" })).content).toContain("Try `/rest 2m`");
  });
});

describe("autocomplete", () => {
  it("suggests lifts, alias first", async () => {
    const r = await handleAutocomplete(ctx(), "lift", "ohp");
    expect(r[0].name).toBe("Overhead Press");
  });
  it("suggests split days", async () => {
    expect((await handleAutocomplete(ctx(), "swap", "")).map((c) => c.name)).toEqual(["Push", "Pull", "Legs"]);
  });
  it("returns nothing for strangers", async () => {
    expect(await handleAutocomplete(ctx("stranger"), "lift", "b")).toEqual([]);
  });
});

describe("discord plumbing", () => {
  it("verifies Ed25519 signatures", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex");
    const body = '{"type":1}';
    const ts = "1700000000";
    const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");
    expect(verifyDiscordRequest(body, sig, ts, raw)).toBe(true);
    expect(verifyDiscordRequest(body + " ", sig, ts, raw)).toBe(false);
    expect(verifyDiscordRequest(body, null, ts, raw)).toBe(false);
    expect(verifyDiscordRequest(body, sig, ts, "")).toBe(false);
  });
  it("builds messages without pings and with buttons", () => {
    const m = toMessage({ content: "hi @everyone", buttons: [{ label: "Undo", id: "undo:x" }] }, 64);
    expect(m.allowed_mentions.parse).toEqual([]);
    expect(m.flags).toBe(64);
    expect(m.components[0].components[0]).toMatchObject({ type: 2, label: "Undo", custom_id: "undo:x" });
  });
  it("registers commands for server and user installs", () => {
    expect(COMMANDS.map((c) => c.name)).toEqual(["today", "log", "undo", "done", "skip", "swap", "lift", "streak", "friends", "plates", "rest"]);
    for (const c of COMMANDS) {
      expect(c.integration_types).toEqual([0, 1]);
      expect(c.description.length).toBeLessThanOrEqual(100);
    }
  });
  it("parses durations", () => {
    expect(parseDuration("2m")).toBe(120);
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("1m30s")).toBe(90);
    expect(parseDuration("2 min")).toBe(120);
    expect(parseDuration("45s")).toBe(45);
    expect(parseDuration("x")).toBeNull();
    expect(formatDuration(125)).toBe("2:05");
  });
});

// Sanity: kg conversion used by the fake matches the app.
it("lb→kg round trip", () => expect(toKg(185, "lb")).toBeCloseTo(83.9146, 3));
