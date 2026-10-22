import type { SupabaseClient } from "@supabase/supabase-js";
import { chat, HttpError, type AiEnv } from "@/lib/ai/ask";
import { findExercise } from "@/lib/domain/match";
import { isLearnableAlias, normalizeAlias } from "@/lib/domain/synonyms";

/**
 * The owner's synonym review (/dev/synonyms). Three inputs:
 * - names that matched nothing (counts only),
 * - community corrections (how many people mapped a name to a lift),
 * - AI suggestions, made on request.
 * Nothing the AI says goes live: every suggestion is checked here, then
 * waits for the owner to approve it.
 */
export interface LibLift {
  id: string;
  name: string;
  aliases: string[];
}

export interface Suggestion {
  alias: string;
  exerciseId: string;
  exercise: string;
  why: "ai" | "votes";
  users?: number;
}

export interface ReviewData {
  misses: { name: string; times: number; guess: Suggestion | null }[];
  votes: Suggestion[];
  approved: { alias: string; exerciseId: string; exercise: string; source: string }[];
}

type Row = Record<string, unknown>;

export async function loadLibrary(sb: SupabaseClient): Promise<LibLift[]> {
  const r = await sb.from("exercises").select("id, name, aliases").is("owner_id", null).order("name");
  if (r.error) throw new Error(r.error.message);
  return (r.data as Row[]).map((x) => ({ id: String(x.id), name: String(x.name), aliases: ((x.aliases as string[] | null) ?? []).map((a) => a.toLowerCase()) }));
}

async function taken(sb: SupabaseClient) {
  const [approved, rejected] = await Promise.all([
    sb.from("exercise_aliases_approved").select("alias, exercise_id, source"),
    sb.from("exercise_aliases_rejected").select("alias, exercise_id"),
  ]);
  if (approved.error) throw new Error(`${approved.error.message} (run migration 0016)`);
  return {
    approved: (approved.data as Row[]).map((r) => ({ alias: String(r.alias), exerciseId: String(r.exercise_id), source: String(r.source) })),
    rejected: new Set((rejected.data as Row[] | null ?? []).map((r) => `${r.alias}|${r.exercise_id}`)),
  };
}

/** Everything the review page shows, minus what's already approved or rejected. */
export async function loadReview(sb: SupabaseClient): Promise<ReviewData> {
  const [lib, t, misses, votes] = await Promise.all([
    loadLibrary(sb),
    taken(sb),
    sb.from("exercise_name_misses").select("name, times").order("times", { ascending: false }).limit(60),
    sb.from("exercise_alias_votes").select("alias, exercise_id"),
  ]);
  const byId = new Map(lib.map((l) => [l.id, l]));
  const approvedAliases = new Set(t.approved.map((a) => a.alias));
  const known = (alias: string) => approvedAliases.has(alias) || lib.some((l) => l.name.toLowerCase() === alias || l.aliases.includes(alias));

  // Community corrections, grouped: library lifts only, most agreed first.
  const counts = new Map<string, number>();
  for (const v of (votes.data as Row[] | null) ?? []) {
    if (!byId.has(String(v.exercise_id))) continue; // someone's own custom lift
    const k = `${v.alias}|${v.exercise_id}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const voteList: Suggestion[] = [...counts.entries()]
    .filter(([k]) => !t.rejected.has(k) && !known(k.split("|")[0]))
    .map(([k, users]) => {
      const [alias, id] = k.split("|");
      return { alias, exerciseId: id, exercise: byId.get(id)!.name, why: "votes" as const, users };
    })
    .sort((a, b) => b.users! - a.users!);

  const missList = ((misses.data as Row[] | null) ?? [])
    .map((m) => ({ name: String(m.name), times: Number(m.times) }))
    .filter((m) => !known(m.name))
    .map((m) => {
      // A typo the matcher can already fix doesn't need a synonym; show its guess.
      const hit = findExercise(m.name, lib);
      return { ...m, guess: hit ? { alias: m.name, exerciseId: hit.item.id, exercise: hit.item.name, why: "votes" as const } : null };
    });

  return {
    misses: missList,
    votes: voteList,
    approved: t.approved.map((a) => ({ ...a, exercise: byId.get(a.exerciseId)?.name ?? "?" })).sort((a, b) => a.alias.localeCompare(b.alias)),
  };
}

export async function approve(sb: SupabaseClient, alias: string, exerciseId: string, source: string) {
  const a = normalizeAlias(alias);
  if (!isLearnableAlias(a)) throw new Error("That name is too short.");
  const lib = await loadLibrary(sb);
  if (!lib.some((l) => l.id === exerciseId)) throw new Error("Only library lifts can get shared synonyms.");
  if (lib.some((l) => l.name.toLowerCase() === a)) throw new Error(`"${a}" is already a lift's name.`);
  const r = await sb.from("exercise_aliases_approved").upsert({ alias: a, exercise_id: exerciseId, source, approved_at: new Date().toISOString() });
  if (r.error) throw new Error(r.error.message);
  await sb.from("exercise_aliases_rejected").delete().eq("alias", a).eq("exercise_id", exerciseId);
}

export async function reject(sb: SupabaseClient, alias: string, exerciseId: string) {
  const a = normalizeAlias(alias);
  const r = await sb.from("exercise_aliases_rejected").upsert({ alias: a, exercise_id: exerciseId });
  if (r.error) throw new Error(r.error.message);
  await sb.from("exercise_aliases_approved").delete().eq("alias", a).eq("exercise_id", exerciseId);
}

/** Dismiss a missed name (e.g. it really is someone's own lift). */
export async function dismissMiss(sb: SupabaseClient, name: string) {
  await sb.from("exercise_name_misses").delete().eq("name", normalizeAlias(name));
}

export function suggestPrompt(mode: "misses" | "library", items: string[], library: LibLift[]): string {
  const lifts = library.map((l) => l.name).join("\n");
  const task =
    mode === "misses"
      ? `Each name below is what a gym-goer typed for an exercise. For each, say which library exercise it means, or skip it if it's not clearly one of them (a different exercise, or not an exercise). Only include confident matches.\n\nNames:\n${items.join("\n")}`
      : `For each library exercise below, list up to 3 other names gym-goers commonly use for it (abbreviations, slang, other common names). Only names that clearly mean this exercise and not another one. Skip it if there are none.\n\nExercises:\n${items.join("\n")}`;
  return `${task}\n\nLibrary exercises (use these names exactly):\n${lifts}\n\nReply with JSON only: {"pairs":[{"alias":"<name people type>","exercise":"<library exercise name>"}]}`;
}

/**
 * Keep only suggestions that are safe to show: the exercise exists by exact
 * name, the alias isn't a lift name, isn't already a synonym of any lift,
 * and wasn't rejected before.
 */
export function validateSuggestions(raw: unknown, library: LibLift[], approved: Set<string>, rejected: Set<string>): Suggestion[] {
  const pairs = (raw as { pairs?: unknown })?.pairs;
  if (!Array.isArray(pairs)) return [];
  const byName = new Map(library.map((l) => [l.name.toLowerCase(), l]));
  const out = new Map<string, Suggestion>();
  for (const p of pairs.slice(0, 200)) {
    if (!p || typeof p !== "object") continue;
    const { alias, exercise } = p as Record<string, unknown>;
    if (typeof alias !== "string" || typeof exercise !== "string") continue;
    const lift = byName.get(exercise.trim().toLowerCase());
    const a = normalizeAlias(alias);
    if (!lift || !isLearnableAlias(a) || a.length > 40) continue;
    if (byName.has(a) || approved.has(a) || library.some((l) => l.aliases.includes(a)) || rejected.has(`${a}|${lift.id}`)) continue;
    if (!out.has(a)) out.set(a, { alias: a, exerciseId: lift.id, exercise: lift.name, why: "ai" });
  }
  return [...out.values()];
}

/** Ask the AI for suggestions (owner only; counts against the owner's AI limit by the caller). */
export async function suggest(sb: SupabaseClient, env: AiEnv, mode: "misses" | "library", fetchImpl: typeof fetch) {
  const [lib, t, review] = await Promise.all([loadLibrary(sb), taken(sb), mode === "misses" ? loadReview(sb) : Promise.resolve(null)]);
  const items =
    mode === "misses"
      ? review!.misses.filter((m) => !m.guess).slice(0, 40).map((m) => m.name)
      : lib.filter((l) => l.aliases.length < 2).slice(0, 40).map((l) => l.name);
  if (!items.length) return { suggestions: [] as Suggestion[], tokensIn: 0, tokensOut: 0 };
  const ienv = { ...env, temperature: 0, frequencyPenalty: 0, topP: 1 };
  const messages = [
    { role: "system" as const, content: "You are a strength-training expert helping maintain an exercise name list. You answer with JSON only." },
    { role: "user" as const, content: suggestPrompt(mode, items, lib) },
  ];
  const models = [env.model, ...(env.fallbackModel && env.fallbackModel !== env.model ? [env.fallbackModel] : [])];
  let lastErr: unknown = null;
  for (const model of models) {
    try {
      const r = await chat({ env: ienv, fetch: fetchImpl }, model, messages, 1500, { response_format: { type: "json_object" } });
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        /* treated as no suggestions */
      }
      return { suggestions: validateSuggestions(parsed, lib, new Set(t.approved.map((a) => a.alias)), t.rejected), tokensIn: r.tokensIn, tokensOut: r.tokensOut };
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status === 429) continue;
      throw e;
    }
  }
  throw lastErr ?? new Error("busy");
}
