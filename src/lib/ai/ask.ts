import type { AppConfig } from "@/config/app.config";
import type { BotData } from "@/lib/bot/data";
import { parseFreeText } from "@/lib/domain/freetext";
import { buildTrainingContext } from "./context";

/**
 * /ask: a read-only AI coach. The model gets a compact training summary and
 * the question, and returns text. It has no tools and nothing it says is
 * written to the database.
 */
export interface AiEnv {
  enabled: boolean;
  apiKey: string | null;
  /** OpenAI-compatible base URL. Groq by default. */
  baseUrl: string;
  model: string;
  fallbackModel: string | null;
  dailyUserLimit: number;
  dailyGlobalLimit: number;
  maxOutputTokens: number;
  contextTokens: number;
}

/** Reads the AI settings from server env vars. GROQ_API_KEY never reaches the browser (no NEXT_PUBLIC_ prefix). */
export function aiEnvFromProcess(e: NodeJS.ProcessEnv = process.env): AiEnv {
  const int = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    enabled: (e.AI_ENABLED ?? "true").toLowerCase() !== "false",
    apiKey: e.GROQ_API_KEY || null,
    baseUrl: (e.AI_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
    model: e.GROQ_MODEL || "openai/gpt-oss-120b",
    fallbackModel: e.GROQ_FALLBACK_MODEL || null,
    dailyUserLimit: int(e.AI_DAILY_USER_LIMIT, 10),
    dailyGlobalLimit: int(e.AI_DAILY_GLOBAL_LIMIT, 70),
    maxOutputTokens: int(e.AI_MAX_OUTPUT_TOKENS, 500),
    contextTokens: int(e.AI_CONTEXT_TOKENS, 2000),
  };
}

export interface AskDeps {
  data: BotData;
  cfg: AppConfig;
  env: AiEnv;
  now: Date;
  discordUserId: string;
  appUrl: string;
  fetch: typeof fetch;
}

export interface AskResult {
  content: string;
  /** For logging/tests: what happened and the token usage reported by the provider. */
  outcome: "answered" | "unlinked" | "disabled" | "user-cap" | "global-cap" | "busy" | "error" | "log-intent" | "empty";
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
}

const DISCORD_LIMIT = 2000;
const FOOTER = "\n-# AI answer from your logged data · not medical advice";

export function systemPrompt(cfg: AppConfig, unit: string): string {
  return [
    `You are ${cfg.brand.botName}, a concise, encouraging lifting coach in the ${cfg.brand.appName} app, talking with one user about their own training.`,
    "Rules:",
    "- Use ONLY the numbers in TRAINING DATA. If something you'd need is missing, say it's missing instead of guessing. Never invent sets, weights, dates or PRs.",
    `- Be brief: at most about 120 words. Plain sentences or a few short bullets. Use ${unit}.`,
    "- You are read-only. If the user is trying to log a set or change their data, tell them to use /log (or the app); don't pretend it was saved.",
    "- Prefer conservative progressions (small jumps only when all reps were hit).",
    "- This is not medical advice. For pain, injury or health concerns, suggest seeing a qualified professional. Never encourage training through pain, extreme cutting, crash dieting or unsafe weight loss.",
  ].join("\n");
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function chat(deps: AskDeps, model: string, system: string, user: string) {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    temperature: 0.4,
    // On reasoning models the cap includes reasoning tokens; low effort keeps them small.
    max_completion_tokens: deps.env.maxOutputTokens,
  };
  if (/gpt-oss/i.test(model)) body.reasoning_effort = "low";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await deps.fetch(`${deps.env.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.env.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new HttpError(res.status, `${res.status} ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: (json.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim(),
      tokensIn: json.usage?.prompt_tokens ?? 0,
      tokensOut: json.usage?.completion_tokens ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function handleAsk(deps: AskDeps, question: string): Promise<AskResult> {
  const { data, cfg, env, now } = deps;
  const bot = cfg.brand.botName;
  const q = question.trim().slice(0, 500);

  const user = await data.findUser(deps.discordUserId);
  if (!user) return { outcome: "unlinked", content: `👋 I'm ${bot}. Link your account first: sign in at ${deps.appUrl} with this Discord account, then ask again.` };
  if (!env.enabled || !env.apiKey) return { outcome: "disabled", content: `🤖 AI answers are switched off right now. Everything else still works: try \`/lift\` or \`/today\`.` };
  if (!q) return { outcome: "empty", content: "Ask me something, e.g. `/ask question: how's my bench trending?`" };

  // A set typed into /ask: point to /log instead of spending tokens.
  if (!q.includes("?") && parseFreeText(q).ok) {
    return { outcome: "log-intent", content: `That looks like a set. I can't save anything from /ask. Use \`/log ${q.slice(0, 80)}\` and confirm it there.` };
  }

  const day = now.toISOString().slice(0, 10); // caps reset at midnight UTC
  const used = await data.aiUsageToday(user.id, day);
  if (used.user >= env.dailyUserLimit) return { outcome: "user-cap", content: `⏳ You've used today's ${env.dailyUserLimit} questions. They reset at midnight UTC. Try again tomorrow!` };
  if (used.global >= env.dailyGlobalLimit) return { outcome: "global-cap", content: `⏳ I've hit today's question limit for everyone (free tier). Try again tomorrow!` };

  const context = await buildTrainingContext(data, user, cfg, now, env.contextTokens);
  const system = systemPrompt(cfg, user.unit);
  const prompt = `TRAINING DATA:\n${context}\n\nQUESTION: ${q}`;

  const models = [env.model, ...(env.fallbackModel && env.fallbackModel !== env.model ? [env.fallbackModel] : [])];
  for (const model of models) {
    try {
      const r = await chat(deps, model, system, prompt);
      await data.recordAiUsage(user.id, day, r.tokensIn, r.tokensOut).catch((e) => console.error("[ask] usage", e));
      if (!r.text) return { outcome: "empty", model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, content: "🤔 I couldn't come up with an answer to that. Try asking it a different way." };
      const room = DISCORD_LIMIT - FOOTER.length;
      const text = r.text.length > room ? `${r.text.slice(0, room - 1).trimEnd()}…` : r.text;
      return { outcome: "answered", model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, content: text + FOOTER };
    } catch (e) {
      if (e instanceof HttpError && e.status === 429) continue; // rate limited: try the fallback model, if any
      console.error("[ask]", e);
      return { outcome: "error", content: `⚠️ I couldn't answer right now. Please try again in a bit.` };
    }
  }
  return { outcome: "busy", content: `⏳ I'm getting a lot of questions right now (free tier limit). Try again in a minute.` };
}
