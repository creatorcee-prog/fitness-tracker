import type { AppConfig } from "@/config/app.config";
import type { BotData } from "@/lib/bot/data";
import { parseFreeText } from "@/lib/domain/freetext";
import { ACTIONS_PROMPT, extractActions, type AccountAction } from "./actions";
import { buildTrainingContext } from "./context";

/**
 * /ask: a read-only AI coach. The model gets a compact training summary and
 * the question, and returns text. It has no tools and nothing it says is
 * written to the database.
 */
export interface AiEnv {
  /**
   * Model that reads photos/screenshots on the Import page (GROQ_VISION_MODEL). Image models on
   * Groq change often (some are "preview"), so it's a setting: swap it without touching code.
   * Empty = photo import off.
   */
  visionModel: string;
  /** Most images per read (each costs ~2K tokens on Groq's free tier, which allows 8K tokens a minute). */
  visionMaxImages: number;
  /** Kill switch (AI_ENABLED=false turns /ask off without a redeploy of code). */
  enabled: boolean;
  apiKey: string | null;
  /** OpenAI-compatible base URL. Groq by default. */
  baseUrl: string;
  model: string;
  fallbackModel: string | null;
  dailyUserLimit: number;
  dailyGlobalLimit: number;
  /** Developer accounts (app user ids): their own higher limit, and their use doesn't count toward everyone's shared cap. */
  devUserIds: string[];
  devDailyLimit: number;
  /** Most tokens the model may write (on gpt-oss this includes its hidden reasoning). */
  maxOutputTokens: number;
  /** Budget for the training summary we send. */
  contextTokens: number;
  /** In-app chat only: how many earlier exchanges to include for follow-up questions (0 = none). */
  historyTurns: number;
  /** Longest question accepted (characters, ~4 per token). Longer text is cut. */
  maxQuestionChars: number;
  /** In-app chat only: extra output tokens so James can add proposed changes (the Apply cards). */
  actionTokens: number;
  /** Sampling: higher temperature = more varied wording. */
  temperature: number;
  /** Sampling: only consider the most likely 90% of words. */
  topP: number;
  /** Discourages repeating the same words. */
  frequencyPenalty: number;
}

/** Reads the AI settings from server env vars. GROQ_API_KEY never reaches the browser (no NEXT_PUBLIC_ prefix). */
export function aiEnvFromProcess(e: NodeJS.ProcessEnv = process.env): AiEnv {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    enabled: (e.AI_ENABLED ?? "true").toLowerCase() !== "false",
    apiKey: e.GROQ_API_KEY || null,
    baseUrl: (e.AI_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
    model: e.GROQ_MODEL || "openai/gpt-oss-120b",
    visionModel: e.GROQ_VISION_MODEL ?? "qwen/qwen3.8-27b",
    visionMaxImages: num(e.AI_VISION_MAX_IMAGES, 2),
    fallbackModel: e.GROQ_FALLBACK_MODEL || null,
    dailyUserLimit: num(e.AI_DAILY_USER_LIMIT, 10),
    dailyGlobalLimit: num(e.AI_DAILY_GLOBAL_LIMIT, 70),
    devUserIds: (e.AI_DEV_USER_IDS ?? "").split(/[\s,]+/).filter(Boolean),
    devDailyLimit: num(e.AI_DEV_DAILY_LIMIT, 200),
    maxOutputTokens: num(e.AI_MAX_OUTPUT_TOKENS, 500),
    contextTokens: num(e.AI_CONTEXT_TOKENS, 2000),
    historyTurns: num(e.AI_CHAT_HISTORY_TURNS, 2),
    actionTokens: num(e.AI_ACTION_TOKENS, 200),
    maxQuestionChars: num(e.AI_MAX_QUESTION_CHARS, 1500),
    temperature: num(e.AI_TEMPERATURE, 0.5),
    topP: num(e.AI_TOP_P, 0.9),
    frequencyPenalty: num(e.AI_FREQUENCY_PENALTY, 0.25),
  };
}

export interface AskDeps {
  data: BotData;
  cfg: AppConfig;
  env: AiEnv;
  now: Date;
  /** Who is asking: a Discord user (/ask) or a signed-in app user (chat panel). */
  who: { discordUserId: string } | { userId: string };
  appUrl: string;
  fetch: typeof fetch;
}

/** One earlier exchange shown in the app's chat (Discord /ask has none). */
export interface ChatTurn {
  question: string;
  answer: string;
}

export interface AskResult {
  content: string;
  /** For logging/tests: what happened and the token usage reported by the provider. */
  outcome: "answered" | "unlinked" | "disabled" | "user-cap" | "global-cap" | "busy" | "error" | "log-intent" | "empty";
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  /** The model's answer without the Discord footer (for the in-app chat). */
  answer?: string;
  /** In-app chat only: validated changes James proposes; the user taps Apply. */
  actions?: AccountAction[];
}

const DISCORD_LIMIT = 2000;
const FOOTER = "\n-# AI answer from your logged data · not medical advice";

/**
 * The system prompt: the standing instructions the model reads before every
 * question. Based on the app owner's coach prompt, plus the rules this
 * integration needs (read-only, only use the provided numbers, units).
 */
export function systemPrompt(cfg: AppConfig, unit: string, inApp = false): string {
  return `You are ${cfg.brand.botName}, a supportive, knowledgeable fitness coach inside a Discord bot for the ${cfg.brand.appName} workout tracking app.

Your style:
- Encouraging but realistic
- Clear and concise (Discord users hate walls of text)
- Prefer short paragraphs and bullet points
- Always prioritize safety

Rules you must follow:
- Never give medical advice
- Never encourage extreme deficits, dangerous form, or overtraining
- If the user asks something medical (pain, injury, illness, medication), politely redirect them to a professional
- Use the actual numbers in TRAINING DATA instead of guessing. If something you'd need isn't there, say it's missing. Never invent sets, weights, dates or PRs
- ${inApp ? "You can't log sets. If the user is trying to log a set, tell them to use the Today screen" : "You can't log or change anything. If the user is trying to log a set, tell them to use /log"}
- Use ${unit} for weights
- Keep responses under ~150-200 words unless the user asks for more detail

You have the user's recent workout history and goals in TRAINING DATA when provided.${inApp ? `\n\n${ACTIONS_PROMPT}` : ""}`;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/**
 * One call to the provider's "chat completions" endpoint (the OpenAI-style API
 * Groq offers). We send the system prompt (instructions), any earlier chat
 * turns, and the user message (training summary + question). We get back text plus a `usage`
 * block saying how many tokens went in and out, which we record for the caps.
 */
/** Text, or (for image-reading models) a mix of text and images. */
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type Message = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

export async function chat(deps: Pick<AskDeps, "env" | "fetch">, model: string, messages: Message[], maxTokens = deps.env.maxOutputTokens, extra: Record<string, unknown> = {}) {
  const { env } = deps;
  const body: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: maxTokens,
    temperature: env.temperature,
    top_p: env.topP,
    frequency_penalty: env.frequencyPenalty,
    ...extra,
  };
  // gpt-oss "thinks" before answering; low effort keeps that short (and cheap).
  if (/gpt-oss/i.test(model)) body.reasoning_effort = "low";

  let res = await post(deps, body);
  // Some models reject optional tuning knobs. Rather than fail, retry once without them.
  if (res.status === 400) {
    const detail = await res.text();
    if (/frequency_penalty|top_p|temperature|reasoning_effort|response_format|json|unsupported|not supported/i.test(detail)) {
      console.warn(`[ask] ${model} rejected an optional parameter, retrying without them: ${detail.slice(0, 200)}`);
      for (const k of ["frequency_penalty", "top_p", "temperature", "reasoning_effort", "response_format"]) delete body[k];
      res = await post(deps, body);
    } else {
      throw new HttpError(400, `400 ${detail.slice(0, 300)}`);
    }
  }
  if (!res.ok) throw new HttpError(res.status, `${res.status} ${(await res.text()).slice(0, 300)}`);

  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    // Some models wrap their reasoning in <think> tags; users shouldn't see it.
    text: (json.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim(),
    tokensIn: json.usage?.prompt_tokens ?? 0,
    tokensOut: json.usage?.completion_tokens ?? 0,
  };
}

/** POST with a 25-second timeout (Discord lets us edit the reply for 15 minutes, but nobody waits that long). */
async function post(deps: Pick<AskDeps, "env" | "fetch">, body: Record<string, unknown>): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    return await deps.fetch(`${deps.env.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.env.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Daily caps, shared by /ask, the app chat and imports.
 * - Everyone: AI_DAILY_USER_LIMIT a day, and all together AI_DAILY_GLOBAL_LIMIT.
 * - Developers (AI_DEV_USER_IDS): AI_DEV_DAILY_LIMIT a day instead, never blocked by the
 *   shared cap, and their use is left out of it so testing doesn't use up friends' questions.
 * Groq's own limit (per API key) still applies to everyone; that's the hard ceiling.
 */
export async function checkAiCaps(data: BotData, env: AiEnv, userId: string, day: string): Promise<{ blocked: null | "user-cap" | "global-cap"; limit: number; dev: boolean }> {
  const dev = env.devUserIds.includes(userId);
  const limit = dev ? env.devDailyLimit : env.dailyUserLimit;
  const used = await data.aiUsageToday(userId, day);
  if (used.user >= limit) return { blocked: "user-cap", limit, dev };
  if (dev) return { blocked: null, limit, dev };
  let devUse = 0;
  for (const id of env.devUserIds) devUse += (await data.aiUsageToday(id, day)).user;
  return { blocked: used.global - devUse >= env.dailyGlobalLimit ? "global-cap" : null, limit, dev };
}

/**
 * The whole /ask flow, in order:
 *  1. Find the app account for this Discord user (stop if not linked).
 *  2. Stop early if AI is switched off, the question is empty, or it's really a set to /log.
 *  3. Check today's caps (per user and for everyone) so we stay inside the free tier.
 *  4. Build a short training summary from the database (the model sees nothing else).
 *  5. Ask the model; on "429 Too Many Requests" try the fallback model once.
 *  6. Record the token usage, trim to Discord's 2,000 characters and return the text.
 * The caller (the Discord route) posts the returned text as the reply.
 */
export async function handleAsk(deps: AskDeps, question: string, history: ChatTurn[] = []): Promise<AskResult> {
  const { data, cfg, env, now } = deps;
  const bot = cfg.brand.botName;
  const inApp = "userId" in deps.who;
  const q = question.trim().slice(0, env.maxQuestionChars);

  const user = "userId" in deps.who ? await data.getUserById(deps.who.userId) : await data.findUser(deps.who.discordUserId);
  if (!user) return { outcome: "unlinked", content: `👋 I'm ${bot}. Link your account first: sign in at ${deps.appUrl} with this Discord account, then ask again.` };
  if (!env.enabled || !env.apiKey) {
    return { outcome: "disabled", content: inApp ? "🤖 AI answers are switched off right now." : "🤖 AI answers are switched off right now. Everything else still works: try `/lift` or `/today`." };
  }
  if (!q) return { outcome: "empty", content: inApp ? "Ask me something, like “how's my bench trending?”" : "Ask me something, e.g. `/ask question: how's my bench trending?`" };

  // A set typed into the question box: point to logging instead of spending tokens.
  if (!q.includes("?") && parseFreeText(q).ok) {
    return {
      outcome: "log-intent",
      content: inApp
        ? "That looks like a set. I can't save anything from chat. Log it on the Today screen (or with `/log` in Discord)."
        : `That looks like a set. I can't save anything from /ask. Use \`/log ${q.slice(0, 80)}\` and confirm it there.`,
    };
  }

  const day = now.toISOString().slice(0, 10); // caps reset at midnight UTC
  const caps = await checkAiCaps(data, env, user.id, day);
  if (caps.blocked === "user-cap") return { outcome: "user-cap", content: `⏳ You've used today's ${caps.limit} questions. They reset at midnight UTC. Try again tomorrow!` };
  if (caps.blocked === "global-cap") return { outcome: "global-cap", content: `⏳ I've hit today's question limit for everyone (free tier). Try again tomorrow!` };

  const context = await buildTrainingContext(data, user, cfg, now, env.contextTokens, inApp);
  const system = systemPrompt(cfg, user.unit, inApp);
  const prompt = `TRAINING DATA:\n${context}\n\nQUESTION: ${q}`;
  // Earlier chat turns (app only), trimmed, so follow-ups like "and squats?" make sense.
  const keep = Math.max(0, env.historyTurns); // note: slice(-0) would return everything, hence the check
  const turns = (keep ? history.slice(-keep) : []).flatMap((t): Message[] => [
    { role: "user", content: t.question.slice(0, 500) },
    { role: "assistant", content: t.answer.slice(0, 800) },
  ]);
  const messages: Message[] = [{ role: "system", content: system }, ...turns, { role: "user", content: prompt }];

  const models = [env.model, ...(env.fallbackModel && env.fallbackModel !== env.model ? [env.fallbackModel] : [])];
  for (const model of models) {
    try {
      // In the app, leave room for a proposed-changes block on top of the answer.
      const r = await chat(deps, model, messages, inApp ? env.maxOutputTokens + env.actionTokens : env.maxOutputTokens);
      await data.recordAiUsage(user.id, day, r.tokensIn, r.tokensOut).catch((e) => console.error("[ask] usage", e));
      const { text: reply, actions } = inApp ? extractActions(r.text) : { text: r.text, actions: [] };
      if (!reply && !actions.length) return { outcome: "empty", model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, content: "🤔 I couldn't come up with an answer to that. Try asking it a different way." };
      const room = DISCORD_LIMIT - FOOTER.length;
      const text = reply.length > room ? `${reply.slice(0, room - 1).trimEnd()}…` : reply;
      return { outcome: "answered", model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, content: text + FOOTER, answer: reply || "Here's what I'd change:", actions };
    } catch (e) {
      if (e instanceof HttpError && e.status === 429) continue; // rate limited: try the fallback model, if any
      console.error("[ask]", e);
      return { outcome: "error", content: `⚠️ I couldn't answer right now. Please try again in a bit.` };
    }
  }
  return { outcome: "busy", content: `⏳ I'm getting a lot of questions right now (free tier limit). Try again in a minute.` };
}
