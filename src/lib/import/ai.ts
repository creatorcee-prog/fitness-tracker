import type { AppConfig } from "@/config/app.config";
import { chat, HttpError, type AiEnv } from "@/lib/ai/ask";
import type { BotData } from "@/lib/bot/data";
import type { ImportedData } from "./types";
import { validateImported } from "./validate";

/**
 * "Have James read it": the model turns messy workout notes into the same
 * structure the CSV and text readers produce. It only transcribes: the
 * prompt forbids inventing anything, the result is validated, and you see
 * a full preview before anything is saved. One import counts as one
 * question toward the daily caps.
 */
export interface ImportEnv {
  /** Longest paste James reads in one go (~4 characters per token). */
  maxChars: number;
  /** Output budget for the JSON (a long log needs room). */
  maxOutputTokens: number;
}

export function importEnvFromProcess(e: NodeJS.ProcessEnv = process.env): ImportEnv {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return { maxChars: num(e.AI_IMPORT_MAX_CHARS, 8000), maxOutputTokens: num(e.AI_IMPORT_OUTPUT_TOKENS, 3500) };
}

export function importPrompt(cfg: AppConfig, unit: string, today: string): string {
  return `You convert workout logs into JSON for the ${cfg.brand.appName} app. You are a careful transcriber, not a coach.

Return ONLY a JSON object:
{"sessions":[{"date":"YYYY-MM-DD","day":"Push"|null,"sets":[{"e":"Bench Press","w":185,"u":"lb","r":5,"n":3,"rpe":null,"wu":false}]}],
 "program":null|{"name":"PPL","mode":"rotation"|"weekly","days":[{"name":"Push","weekday":null,"exercises":[{"e":"Bench Press","sets":4,"reps":"6-8","w":185,"u":"lb","note":null}]}]},
 "goals":[{"goal":"lift_e1rm","lift":"Bench Press","target":225,"deadline":"YYYY-MM-DD"|null}|{"goal":"lift_reps","lift":"Pull-up","weight":0,"target":12}|{"goal":"sessions_per_week","target":4}],
 "terms":[{"term":"RE","options":["Rest","Recovery"]}],
 "unclear":["lines you could not interpret, copied verbatim"]}

Rules:
- Be faithful. Copy exercise names as written (fix capitalization only). Never invent, estimate or fill in sets, weights, reps, dates or days.
- One sets entry = n identical sets: w weight (0 for bodyweight), u "lb" or "kg" (default ${unit}), r reps, n how many sets. Warm-ups: "wu":true.
- "day" is the workout's own label if it has one (Push, Legs, Upper A, Day 2), else null.
- Dates without a year: use the most recent such date on or before ${today}. Weekday names alone: leave the session out and add the line to "unclear".
- "program": if the text lays out a plan/split (a list of days with their exercises, with or without dates). Otherwise null. weekday 0=Sunday..6=Saturday, only when stated (then mode "weekly").
  sets/reps: only if stated, else null (never guess). "w": a working weight if listed. "note": anything else about the lift as written (e.g. "30s").
  An ambiguous multiplier after a weight like "x2" (pair of dumbbells? 2 sets?): put it in "detail":"x2", not in sets or note.
  Day names: use the plan's own label; expand obvious gym abbreviations (CH=Chest, BK=Back, LG=Legs, SH=Shoulders, AR=Arms).
- "terms": any code or abbreviation you're NOT sure about (a day label like "RE", an unfamiliar lift short-form): keep it as written where it appears and list it here with 2-4 likely meanings. Asking is better than guessing.
- "goals": only goals the text states. Otherwise [].
- Put anything you couldn't place in "unclear". Don't explain; output JSON only.`;
}

export type ImportOutcome =
  | { ok: true; data: ImportedData; tokensIn: number; tokensOut: number; model: string }
  | { ok: false; outcome: "disabled" | "too-long" | "empty" | "user-cap" | "global-cap" | "busy" | "error" | "bad-output"; message: string };

export async function readWithJames(
  deps: { data: BotData; cfg: AppConfig; env: AiEnv; importEnv: ImportEnv; now: Date; userId: string; fetch: typeof fetch },
  text: string,
): Promise<ImportOutcome> {
  const { data, cfg, env, importEnv, now } = deps;
  const input = text.trim();
  if (!env.enabled || !env.apiKey) return { ok: false, outcome: "disabled", message: `${cfg.brand.botName} is switched off right now. The CSV and plain-text readers still work.` };
  if (!input) return { ok: false, outcome: "empty", message: "Paste some workouts first." };
  if (input.length > importEnv.maxChars) {
    return { ok: false, outcome: "too-long", message: `That's ${input.length.toLocaleString()} characters; ${cfg.brand.botName} reads up to ${importEnv.maxChars.toLocaleString()} at a time on the free tier. Import it in parts (e.g. a month at a time), or use “Read it” for logs in a standard format.` };
  }
  const user = await data.getUserById(deps.userId);
  if (!user) return { ok: false, outcome: "error", message: "Couldn't find your account." };
  const day = now.toISOString().slice(0, 10);
  const used = await data.aiUsageToday(user.id, day);
  if (used.user >= env.dailyUserLimit) return { ok: false, outcome: "user-cap", message: `You've used today's ${env.dailyUserLimit} ${cfg.brand.botName} requests. They reset at midnight UTC.` };
  if (used.global >= env.dailyGlobalLimit) return { ok: false, outcome: "global-cap", message: "Today's free-tier limit is used up for everyone. Try again tomorrow." };

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const messages = [
    { role: "system" as const, content: importPrompt(cfg, user.unit, today) },
    { role: "user" as const, content: input },
  ];
  // Transcribing, not chatting: low temperature, no repetition penalty (logs repeat on purpose).
  const ienv = { ...env, temperature: 0, frequencyPenalty: 0, topP: 1 };
  const models = [env.model, ...(env.fallbackModel && env.fallbackModel !== env.model ? [env.fallbackModel] : [])];
  for (const model of models) {
    try {
      const r = await chat({ env: ienv, fetch: deps.fetch }, model, messages, importEnv.maxOutputTokens, { response_format: { type: "json_object" } });
      await data.recordAiUsage(user.id, day, r.tokensIn, r.tokensOut).catch((e) => console.error("[import] usage", e));
      const json = r.text.replace(/^```(?:json)?\s*|\s*```$/g, "");
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return { ok: false, outcome: "bad-output", message: `${cfg.brand.botName} couldn't finish reading that${r.tokensOut >= importEnv.maxOutputTokens - 50 ? " (it was too long to answer in one go: try a smaller part)" : ""}. Nothing was saved.` };
      }
      return { ok: true, data: validateImported(parsed, user.unit, { sets: cfg.import.defaultSets, reps: cfg.import.defaultReps }), tokensIn: r.tokensIn, tokensOut: r.tokensOut, model };
    } catch (e) {
      if (e instanceof HttpError && e.status === 429) continue;
      console.error("[import]", e);
      return { ok: false, outcome: "error", message: `${cfg.brand.botName} couldn't read it right now. Please try again in a bit.` };
    }
  }
  return { ok: false, outcome: "busy", message: "The free tier is busy (rate limited). Try again in a minute, or with a smaller part." };
}
