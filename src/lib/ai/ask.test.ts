import { beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "@/config/app.config";
import { FakeData } from "@/lib/bot/testing";
import { toKg } from "@/lib/domain/units";
import { aiEnvFromProcess, handleAsk, systemPrompt, type AiEnv, type AskDeps } from "./ask";
import { buildTrainingContext, estimateTokens } from "./context";

const NOW = new Date("2026-10-21T17:00:00Z");
let data: FakeData;
let calls: { url: string; body: Record<string, unknown> }[];

const env = (over: Partial<AiEnv> = {}): AiEnv => ({ ...aiEnvFromProcess({} as NodeJS.ProcessEnv), apiKey: "test-key", ...over });

/** A fake provider: each call takes the next scripted response. */
function fakeFetch(script: ({ status: number; json?: unknown } | Error)[]): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const next = script.shift() ?? { status: 500 };
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.json ?? { error: "x" }), { status: next.status });
  }) as unknown as typeof fetch;
}

const ok = (text: string, pin = 900, pout = 120) => ({ status: 200, json: { choices: [{ message: { content: text } }], usage: { prompt_tokens: pin, completion_tokens: pout } } });

const deps = (f: typeof fetch, e = env(), who = "d1"): AskDeps => ({ data, cfg: defaultConfig, env: e, now: NOW, who: { discordUserId: who }, appUrl: "https://app.test", fetch: f });
const appDeps = (f: typeof fetch, e = env()): AskDeps => ({ data, cfg: defaultConfig, env: e, now: NOW, who: { userId: "u1" }, appUrl: "https://app.test", fetch: f });

async function seedHistory() {
  for (let i = 0; i < 6; i++) {
    const at = new Date(NOW.getTime() - (12 - i * 2) * 86_400_000);
    const s = await data.startSession("u1", "split-ppl-d0", at);
    for (let k = 0; k < 3; k++) {
      await data.addSet("u1", { sessionId: s.id, exerciseId: "ex-bench", setIndex: k, weightKg: toKg(175 + i * 5, "lb"), reps: 5, rpe: null, isWarmup: false, note: null, createdAt: new Date(at.getTime() + k * 60_000).toISOString() });
    }
    await data.finishSession("u1", s.id, new Date(at.getTime() + 3_600_000));
  }
}

beforeEach(() => {
  data = new FakeData();
  calls = [];
});

describe("/ask", () => {
  it("answers from a server-built summary and records usage", async () => {
    await seedHistory();
    const r = await handleAsk(deps(fakeFetch([ok("Your bench is up 25 lb in 12 days. Nice!")])), "How is my bench trending?");
    expect(r.outcome).toBe("answered");
    expect(r.content).toContain("Your bench is up 25 lb");
    expect(r.content).toContain("not medical advice");
    // Request shape: Groq OpenAI-compatible endpoint, low reasoning, capped output.
    expect(calls[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(calls[0].body).toMatchObject({ model: "openai/gpt-oss-120b", reasoning_effort: "low", max_completion_tokens: 500, temperature: 0.5, top_p: 0.9, frequency_penalty: 0.25 });
    const user = (calls[0].body.messages as { content: string }[])[1].content;
    expect(user).toContain("Bench Press 200x5");
    expect(user).toContain("QUESTION: How is my bench trending?");
    expect((await data.aiUsageToday("u1", "2026-10-21")).user).toBe(1);
    expect(data.aiUsage.get("u1:2026-10-21")).toMatchObject({ tin: 900, tout: 120 });
  });

  it("falls back to GROQ_FALLBACK_MODEL on 429", async () => {
    const r = await handleAsk(deps(fakeFetch([{ status: 429 }, ok("Fallback answer")]), env({ fallbackModel: "llama-3.1-8b-instant" })), "What's next?");
    expect(r).toMatchObject({ outcome: "answered", model: "llama-3.1-8b-instant" });
    expect(calls.map((c) => c.body.model)).toEqual(["openai/gpt-oss-120b", "llama-3.1-8b-instant"]);
    expect(calls[1].body.reasoning_effort).toBeUndefined();
  });

  it("says 'try later' when rate limited with no fallback left", async () => {
    const r = await handleAsk(deps(fakeFetch([{ status: 429 }])), "What's next?");
    expect(r.outcome).toBe("busy");
    expect(r.content).toContain("Try again in a minute");
    expect((await data.aiUsageToday("u1", "2026-10-21")).user).toBe(0);
  });

  it("stops at the per-user daily cap without calling the provider", async () => {
    for (let i = 0; i < 10; i++) await data.recordAiUsage("u1", "2026-10-21", 1, 1);
    const r = await handleAsk(deps(fakeFetch([ok("x")])), "Anything?");
    expect(r.outcome).toBe("user-cap");
    expect(calls).toHaveLength(0);
  });

  it("stops at the global daily cap", async () => {
    for (let i = 0; i < 70; i++) await data.recordAiUsage(`other-${i}`, "2026-10-21", 1, 1);
    expect((await handleAsk(deps(fakeFetch([ok("x")])), "Anything?")).outcome).toBe("global-cap");
    expect(calls).toHaveLength(0);
  });

  it("asks unlinked users to link their account", async () => {
    const r = await handleAsk(deps(fakeFetch([ok("x")]), env(), "stranger"), "Hi?");
    expect(r.outcome).toBe("unlinked");
    expect(r.content).toContain("sign in at https://app.test");
    expect(calls).toHaveLength(0);
  });

  it("is off with AI_ENABLED=false or no key", async () => {
    expect((await handleAsk(deps(fakeFetch([]), env({ enabled: false })), "Hi?")).outcome).toBe("disabled");
    expect((await handleAsk(deps(fakeFetch([]), env({ apiKey: null })), "Hi?")).outcome).toBe("disabled");
    expect(calls).toHaveLength(0);
  });

  it("points set-like text to /log instead of spending tokens", async () => {
    const r = await handleAsk(deps(fakeFetch([ok("x")])), "bench 185 4x8");
    expect(r.outcome).toBe("log-intent");
    expect(r.content).toContain("/log bench 185 4x8");
    expect(calls).toHaveLength(0);
  });

  it("keeps replies within Discord's 2,000 characters", async () => {
    const r = await handleAsk(deps(fakeFetch([ok("a".repeat(5000))])), "Tell me everything?");
    expect(r.content.length).toBeLessThanOrEqual(2000);
    expect(r.content).toContain("…");
  });

  it("retries without optional knobs if the model rejects one", async () => {
    const reject = { status: 400, json: { error: { message: "frequency_penalty is not supported for this model" } } };
    const r = await handleAsk(deps(fakeFetch([reject, ok("Fine without it")])), "What's next?");
    expect(r.outcome).toBe("answered");
    expect(calls[1].body.frequency_penalty).toBeUndefined();
    expect(calls[1].body.max_completion_tokens).toBe(500);
  });

  it("uses the coach prompt with the safety and read-only rules", () => {
    const p = systemPrompt(defaultConfig, "lb");
    expect(p).toContain("You are James, a supportive, knowledgeable fitness coach");
    expect(p).toContain("Never give medical advice");
    expect(p).toContain("use /log");
    expect(p).toContain("~150-200 words");
  });

  it("handles provider errors gracefully", async () => {
    expect((await handleAsk(deps(fakeFetch([{ status: 500 }])), "Hi?")).outcome).toBe("error");
    expect((await handleAsk(deps(fakeFetch([new Error("network down")])), "Hi?")).outcome).toBe("error");
  });

  it("reads env: Groq defaults, caps and the kill switch", () => {
    const e = aiEnvFromProcess({ GROQ_API_KEY: "k", AI_DAILY_USER_LIMIT: "3", AI_ENABLED: "FALSE" } as unknown as NodeJS.ProcessEnv);
    expect(e).toMatchObject({ apiKey: "k", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", dailyUserLimit: 3, dailyGlobalLimit: 70, enabled: false });
  });
});

describe("in-app chat", () => {
  it("answers for a signed-in app user and returns the answer without the Discord footer", async () => {
    const r = await handleAsk(appDeps(fakeFetch([ok("Keep going!")])), "How am I doing?");
    expect(r).toMatchObject({ outcome: "answered", answer: "Keep going!" });
    expect((await data.aiUsageToday("u1", "2026-10-21")).user).toBe(1); // same cap as Discord
  });
  it("includes only the last N earlier turns", async () => {
    const history = [1, 2, 3].map((i) => ({ question: `Q${i}?`, answer: `A${i}` }));
    await handleAsk(appDeps(fakeFetch([ok("x")]), env({ historyTurns: 2 })), "And squats?", history);
    const msgs = calls[0].body.messages as { role: string; content: string }[];
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant", "user", "assistant", "user"]);
    expect(msgs[1].content).toBe("Q2?");
    expect(msgs[5].content).toContain("QUESTION: And squats?");
  });
  it("can turn history off", async () => {
    await handleAsk(appDeps(fakeFetch([ok("x")]), env({ historyTurns: 0 })), "Hi?", [{ question: "Q?", answer: "A" }]);
    expect((calls[0].body.messages as unknown[]).length).toBe(2);
  });
  it("points sets to the Today screen in the app", async () => {
    expect((await handleAsk(appDeps(fakeFetch([])), "bench 185x5")).content).toContain("Today screen");
  });
});

describe("training context", () => {
  it("is compact and only contains logged facts", async () => {
    await seedHistory();
    const user = (await data.findUser("d1"))!;
    const ctx = await buildTrainingContext(data, user, defaultConfig, NOW);
    expect(ctx).toContain("Today's split day: Pull");
    expect(ctx).toContain("Last 5 sessions");
    expect(ctx).toContain("Recent PRs:");
    expect(ctx).toContain("Goals: none set.");
    expect(ctx).toContain("Bodyweight: not logged.");
    expect(estimateTokens(ctx + systemPrompt(defaultConfig, "lb"))).toBeLessThan(2500);
  });

  it("shrinks to fit the token budget", async () => {
    await seedHistory();
    const user = (await data.findUser("d1"))!;
    const small = await buildTrainingContext(data, user, defaultConfig, NOW, 150);
    expect(small).not.toContain("Last 5 sessions");
  });

  it("includes goals and bodyweight trend when logged", async () => {
    data.goals = [{ id: "g1", type: "lift_e1rm", exerciseId: "ex-bench", targetValue: toKg(250, "lb"), targetWeightKg: null, deadline: "2026-12-31", achievedAt: null, createdAt: NOW.toISOString() }];
    data.bodyweight = [{ date: "2026-09-01", weightKg: toKg(185, "lb") }, { date: "2026-10-20", weightKg: toKg(181, "lb") }];
    const ctx = await buildTrainingContext(data, (await data.findUser("d1"))!, defaultConfig, NOW);
    expect(ctx).toContain("- Bench Press est. 1RM 250 lb: now 0 / 250 lb (0%), deadline 2026-12-31");
    expect(ctx).toContain("Bodyweight: 181 lb on 2026-10-20, -4 lb vs 4 weeks earlier");
  });
});
