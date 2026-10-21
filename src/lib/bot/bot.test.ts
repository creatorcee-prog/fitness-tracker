import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "@/config/app.config";
import { advance, getToday } from "@/lib/domain/split";
import type { Exercise, FriendStatus, PREvent, Session, SetEntry, Split, SplitState } from "@/lib/domain/types";
import { toKg } from "@/lib/domain/units";
import { seedSplit, SEED_EXERCISES } from "@/lib/store/seed";
import type { NewSet } from "@/lib/store/types";
import { COMMANDS, DiscordError, toMessage, verifyDiscordRequest } from "./discord";
import { runReminders, sendTestReminder } from "./reminders";
import { FakeData } from "./testing";
import { formatDuration, parseDuration } from "./duration";
import { decodeEntries, encodeEntries, handleAutocomplete, handleCommand, handleComponent, type BotContext } from "./handlers";

let data: FakeData;
let clock: number;
const ctx = (discordUserId = "d1"): BotContext => ({ data, cfg: defaultConfig, now: new Date(clock), discordUserId, appUrl: "https://app.test" });
const run = async (name: string, opts: Record<string, string | number> = {}, who?: string) => {
  clock += 60_000;
  return handleCommand(ctx(who), name, opts);
};

/** /log then press [Confirm] (if the reply offers one), like a user would. */
async function logWith(c: BotContext, sets: string) {
  const r = await handleCommand(c, "log", { sets });
  const confirm = r.buttons?.find((b) => b.id.startsWith("lc:"));
  return confirm ? handleComponent(c, confirm.id) : r;
}
const logC = async (sets: string, who?: string) => {
  clock += 60_000;
  return logWith(ctx(who), sets);
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
    const r = await logC("bench 185x5x2");
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
    await logC("ohp 95x8");
    const r = await logC("95x7");
    expect(r.content).toContain("Overhead Press");
  });
  it("converts kg", async () => {
    await logC("bench 100kg x5");
    expect(data.sets[0].weightKg).toBe(100);
  });
  it("flags PRs", async () => {
    await logC("bench 185x5");
    const r = await logC("bench 195x5");
    expect(r.content).toContain("Heaviest");
    expect(r.content).toContain("e1RM PR");
  });
  it("rejects unknown lifts and junk", async () => {
    const unknown = await logC("zercher 135x5");
    expect(unknown.content).toContain("I don't have a lift called **zercher**");
    expect(unknown.select?.options.length).toBeGreaterThan(0);
    expect((await logC("lots of reps")).content).toContain("I didn't see any numbers");
    const noName = await logC("185x5");
    expect(noName.content).toContain("Which lift?");
    expect(noName.select?.options[0].label).toBe("Bench Press"); // today's plan first
    expect(data.sets).toHaveLength(0);
  });
});

describe("/log confirm flow", () => {
  it("shows the parsed result and saves nothing until Confirm", async () => {
    const r = await run("log", { sets: "4x8 bench 185" });
    expect(r.content).toContain("**Bench Press**: 4 × 8 reps @ 185 lb");
    expect(r.buttons?.map((b) => b.label)).toEqual(["Confirm", "Cancel"]);
    expect(data.sets).toHaveLength(0);
    const saved = await handleComponent(ctx(), r.buttons![0].id);
    expect(saved.content).toContain("✅ **Bench Press**");
    expect(data.sets).toHaveLength(4);
    expect(data.sets[0].weightKg).toBeCloseTo(toKg(185, "lb"), 2);
  });
  it("Cancel saves nothing", async () => {
    const r = await run("log", { sets: "squat 3x5 @ 225" });
    expect((await handleComponent(ctx(), r.buttons![1].id)).content).toContain("Nothing was saved");
    expect(data.sets).toHaveLength(0);
  });
  it("picking from the menu leads to a Confirm", async () => {
    const r = await run("log", { sets: "benchy 185 3x5" });
    const pick = await handleComponent(ctx(), r.select!.id, ["ex-incline-db"]);
    expect(pick.content).toContain("**Incline Dumbbell Press**: 3 × 5 reps @ 185 lb");
    await handleComponent(ctx(), pick.buttons![0].id);
    expect(data.sets.map((x) => x.exerciseId)).toEqual(["ex-incline-db", "ex-incline-db", "ex-incline-db"]);
  });
  it("kg suffix is respected for lb users", async () => {
    const r = await run("log", { sets: "bench 100kg 3x5" });
    expect(r.content).toContain("@ 220.5 lb");
    await handleComponent(ctx(), r.buttons![0].id);
    expect(data.sets[0].weightKg).toBe(100);
  });
  it("rejects tampered or expired buttons", async () => {
    expect((await handleComponent(ctx(), "lc:not-a-lift:100*5*1")).content).toContain("expired");
    expect((await handleComponent(ctx(), "lp:100*5*1", ["nope"])).content).toContain("expired");
    expect(data.sets).toHaveLength(0);
  });
  it("round-trips set encoding", () => {
    const e = [{ weightKg: 83.915, reps: 8, rpe: null }, { weightKg: 83.915, reps: 8, rpe: null }, { weightKg: 90, reps: 5, rpe: 8 }];
    expect(encodeEntries(e)).toBe("83.915*8*2,90*5*1*8");
    expect(decodeEntries(encodeEntries(e))).toEqual(e);
  });
  it("explains what was missing", async () => {
    expect((await run("log", { sets: "squat 3 sets of 5" })).content).toContain("no weight");
  });
});

describe("buttons", () => {
  it("[Same again] repeats the set; [Undo] removes it", async () => {
    const r = await logC("bench 185x5");
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
    const r = await logC("bench 185x5");
    await run("done");
    expect((await handleComponent(ctx(), r.buttons![0].id)).content).toContain("workout is finished");
  });
  it("buttons only act for the account that pressed them", async () => {
    const r = await logC("bench 185x5");
    expect((await handleComponent(ctx("stranger"), r.buttons![1].id)).content).toContain("Sign in");
    expect(data.sets).toHaveLength(1);
  });
  it("[Skip] skips today", async () => {
    expect((await handleComponent(ctx(), "skip")).content).toContain("Skipped **Push**. Next up: **Pull**");
  });
});

describe("/undo, /done, /skip, /swap", () => {
  it("/undo removes the last set", async () => {
    await logC("bench 185x5x2");
    expect((await run("undo")).content).toContain("Removed **Bench Press** 185 × 5");
    expect(data.sets).toHaveLength(1);
  });
  it("/done finishes, summarises and advances", async () => {
    await logC("bench 185x5x3");
    const r = await run("done");
    expect(r.content).toContain("Push done");
    expect(r.content).toContain("3 sets");
    expect(r.content).toContain("Next up: **Pull**");
    expect((await run("today")).content).toContain("Today: Pull");
    expect((await run("done")).content).toContain("No workout in progress");
  });
  it("/skip refuses during a workout", async () => {
    await logC("bench 185x5");
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
    await logC("bench 185x5");
    const r = await run("lift", { name: "bench" });
    expect(r.content).toContain("**Bench Press**");
    expect(r.content).toContain("185×5 lb");
    expect(r.content).toContain("Heaviest 185 lb × 5");
  });
  it("/streak counts this week", async () => {
    await logC("bench 185x5");
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

describe("/goal", () => {
  it("explains how to add goals", async () => {
    expect((await run("goal")).content).toContain("No goals yet");
  });
  it("shows progress bars", async () => {
    await logC("bench 185x5");
    data.goals = [
      { id: "g1", type: "lift_e1rm", exerciseId: "ex-bench", targetValue: toKg(250, "lb"), targetWeightKg: null, deadline: null, achievedAt: null, createdAt: new Date(clock).toISOString() },
      { id: "g2", type: "sessions_per_week", exerciseId: null, targetValue: 3, targetWeightKg: null, deadline: null, achievedAt: null, createdAt: new Date(clock).toISOString() },
    ];
    const r = await run("goal");
    expect(r.content).toContain("**Bench Press est. 1RM 250 lb**");
    expect(r.content).toMatch(/▰+▱+ 215\.8 \/ 250 lb \(86%\)/);
    expect(r.content).toContain("0 / 3 this week");
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
    expect(COMMANDS.map((c) => c.name)).toEqual(["today", "log", "undo", "done", "skip", "swap", "lift", "streak", "friends", "goal", "bodyweight", "leaderboard", "help", "plates", "rest", "ask", "announce"]);
    expect(COMMANDS.find((c) => c.name === "announce")!.contexts).toEqual([0]);
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

describe("PR announcements", () => {
  const posts: { channel: string; content: string }[] = [];
  const withPost = (opts: Partial<BotContext> = {}): BotContext => ({ ...ctx(), post: async (channel, r) => void posts.push({ channel, content: r.content }), ...opts });
  beforeEach(() => void (posts.length = 0));

  it("/announce on needs a server channel", async () => {
    expect((await handleCommand(withPost(), "announce", { mode: "on" })).content).toContain("inside a server channel");
  });
  it("/announce on posts a confirmation and saves the channel", async () => {
    const r = await handleCommand(withPost({ guildId: "g", channelId: "c1" }), "announce", { mode: "on" });
    expect(r.content).toContain("Done");
    expect(posts[0]).toMatchObject({ channel: "c1" });
    expect(data.users[0]).toMatchObject({ announceChannelId: "c1", announcePrs: true });
  });
  it("/announce explains when the bot can't post", async () => {
    const r = await handleCommand({ ...ctx(), guildId: "g", channelId: "c1", post: async () => { throw new Error("403"); } }, "announce", { mode: "on" });
    expect(r.content).toContain("can't post in this channel");
    expect(data.users[0].announcePrs).toBe(false);
  });
  it("posts PRs once, only when opted in", async () => {
    await logWith(withPost(), "bench 185x5"); // baseline, no PR
    clock += 60_000;
    await logWith({ ...withPost(), now: new Date(clock) }, "bench 195x5");
    expect(posts).toHaveLength(0); // not opted in
    await data.setAnnounce("u1", "c1", true);
    clock += 60_000;
    await logWith({ ...withPost(), now: new Date(clock) }, "bench 205x5");
    expect(posts).toHaveLength(1);
    expect(posts[0].content).toContain("**Cee** just hit a **Bench Press** PR");
    expect(posts[0].content).toContain("205 × 5 lb");
  });
});

describe("reminders / check-in", () => {
  const due = (over: Partial<FakeData["reminders"][number]> = {}) =>
    data.reminders.push({ reminderId: "r1", userId: "u1", discordId: "d1", localDate: "2026-10-21", snoozed: false, sentOn: null, enabled: true, error: null, snoozedUntil: null, ...over });
  const dms: { to: string; content: string; buttons: string[] }[] = [];
  const deps = (sendDM?: () => Promise<void>) => ({
    data, cfg: defaultConfig, now: new Date(clock), appUrl: "https://app.test",
    sendDM: sendDM ?? (async (to: string, r: { content: string; buttons?: { id: string }[] }) => void dms.push({ to, content: r.content, buttons: (r.buttons ?? []).map((b) => b.id) })),
  });
  beforeEach(() => void (dms.length = 0));

  it("DMs today's day with check-in buttons and marks it sent", async () => {
    due();
    const out = await runReminders(deps());
    expect(out[0].result).toBe("sent");
    expect(dms[0].content).toContain("**Push** is up today: Bench Press, Overhead Press, Incline Dumbbell Press");
    expect(dms[0].buttons).toEqual(["ci:start", "ci:rest", "ci:skip", "ci:snooze:r1"]);
    expect(data.reminders[0].sentOn).toBe("2026-10-21");
    expect(await runReminders(deps())).toEqual([]); // once per day
  });
  it("adds a weigh-in line for people who track their weight, and sends it alone when the workout part is skipped", async () => {
    data.bodyweight.push({ date: "2026-10-19", weightKg: toKg(182, "lb") });
    due();
    await runReminders(deps());
    expect(dms[0].content).toContain("**Push** is up today");
    expect(dms[0].content).toContain("weigh in today: `/bodyweight 182`");
    data.reminders.length = 0;
    await data.startSession("u1", null, new Date("2026-10-21T08:00:00Z"));
    due();
    expect((await runReminders(deps()))[0].result).toBe("sent");
    expect(dms[1].content).toMatch(/^⚖️/);
    expect(dms[1].buttons).toEqual([]);
  });
  it("skips when you already trained today", async () => {
    await data.startSession("u1", null, new Date("2026-10-21T08:00:00Z"));
    due();
    expect((await runReminders(deps()))[0]).toMatchObject({ result: "skipped", reason: "already trained today" });
    expect(dms).toHaveLength(0);
  });
  it("skips weekly rest days", async () => {
    data.split = { ...data.split!, mode: "weekly" }; // Push Mon, Pull Wed, Legs Fri
    clock = Date.parse("2026-10-22T17:00:00Z"); // Thursday
    due({ localDate: "2026-10-22" });
    expect((await runReminders(deps()))[0]).toMatchObject({ result: "skipped", reason: "rest day" });
  });
  it("turns reminders off when Discord refuses the DM", async () => {
    due();
    const out = await runReminders(deps(async () => { throw new DiscordError("blocked", 403, 50007); }));
    expect(out[0].result).toBe("failed");
    expect(data.reminders[0]).toMatchObject({ enabled: false });
    expect(data.reminders[0].error).toContain("allow DMs");
  });
  it("retries on other errors", async () => {
    due();
    const out = await runReminders(deps(async () => { throw new DiscordError("down", 500, null); }));
    expect(out[0].result).toBe("retry");
    expect(data.reminders[0]).toMatchObject({ enabled: true, sentOn: null });
  });
  it("Send test reminder DMs even after training, without touching the reminder", async () => {
    await data.startSession("u1", null, new Date(clock - 3_600_000));
    due();
    const r = await sendTestReminder(deps(), "u1", "r1");
    expect(r.ok).toBe(true);
    expect(dms[0].content).toContain("Test reminder");
    expect(dms[0].buttons).toContain("ci:snooze:r1");
    expect(data.reminders[0].sentOn).toBeNull();
  });
  it("Send test reminder explains blocked DMs", async () => {
    const r = await sendTestReminder(deps(async () => { throw new DiscordError("blocked", 403, 50007); }), "u1");
    expect(r).toMatchObject({ ok: false });
    expect(r.message).toContain("allow DMs");
  });
  it("[Start workout] starts today's day", async () => {
    const r = await handleComponent(ctx(), "ci:start");
    expect(r.content).toContain("Started **Push**");
    expect(data.sessions[0].splitDayId).toBe("split-ppl-d0");
    expect((await handleComponent(ctx(), "ci:start")).content).toContain("already have a workout");
  });
  it("[Snooze] snoozes the user's reminder", async () => {
    due();
    expect((await handleComponent(ctx(), "ci:snooze:r1")).content).toContain("Snoozed");
    expect(data.reminders[0].snoozedUntil?.getTime()).toBe(clock + 60 * 60_000);
    expect((await handleComponent(ctx(), "ci:snooze:nope")).content).toContain("no longer exists");
  });
  it("[Rest day] and [Skip]", async () => {
    expect((await handleComponent(ctx(), "ci:rest")).content).toContain("Rest day");
    expect((await handleComponent(ctx(), "ci:skip")).content).toContain("Skipped **Push**");
  });
});

// Sanity: kg conversion used by the fake matches the app.
it("lb→kg round trip", () => expect(toKg(185, "lb")).toBeCloseTo(83.9146, 3));

describe("/bodyweight and /help", () => {
  it("logs today's weight (replacing an earlier entry) and shows the trend", async () => {
    for (let i = 1; i <= 20; i++) data.bodyweight.push({ date: new Date(Date.UTC(2026, 9, 21 - i * 1)).toISOString().slice(0, 10), weightKg: toKg(190 - i * 0.25, "lb") });
    const r = await run("bodyweight", { weight: 186 });
    expect(r.content).toContain("Logged **186 lb**");
    expect(r.content).toMatch(/Trend: \+\d/);
    await run("bodyweight", { weight: 185 });
    expect(data.bodyweight.filter((b) => b.date === "2026-10-21")).toHaveLength(1);
    expect((await run("bodyweight")).content).toContain("Latest: **185 lb**");
  });
  it("accepts kg and rejects typos", async () => {
    expect((await run("bodyweight", { weight: 82, unit: "kg" })).content).toContain("Logged **180.8 lb**");
    expect((await run("bodyweight", { weight: 1800 })).content).toContain("doesn't look like a bodyweight");
  });
  it("/help works without an account", async () => {
    const r = await run("help", {}, "stranger");
    expect(r.content).toContain("/log");
    expect(r.content).toContain("/bodyweight 182");
  });
  it("registers both commands", () => {
    expect(COMMANDS.map((c) => c.name)).toEqual(expect.arrayContaining(["bodyweight", "leaderboard", "help"]));
  });
});

describe("/leaderboard", () => {
  it("explains and asks to opt in, then ranks you after joining", async () => {
    expect((await run("leaderboard")).content).toContain("/leaderboard join");
    const old = new Date(Date.UTC(2026, 7, 1)).toISOString();
    const recent = new Date(Date.UTC(2026, 9, 18)).toISOString();
    const bench = data.exercises.find((e) => /bench/i.test(e.name))!;
    data.sets.push(
      { id: "a", sessionId: "s", exerciseId: bench.id, setIndex: 0, weightKg: 100, reps: 5, rpe: null, isWarmup: false, note: null, createdAt: old },
      { id: "b", sessionId: "s", exerciseId: bench.id, setIndex: 0, weightKg: 110, reps: 5, rpe: null, isWarmup: false, note: null, createdAt: recent },
    );
    const r = await run("leaderboard", { mode: "join" });
    expect(r.content).toContain("You're in!");
    expect(r.content).toContain("+10.0%");
    expect((await run("leaderboard", { mode: "leave" })).content).toContain("off the leaderboard");
    expect((await run("leaderboard")).content).toContain("/leaderboard join");
  });
});
