import { editDistance, typoAllowance } from "./match";
import type { Exercise } from "./types";

/**
 * Synonyms that learn. Three sources on top of the built-in library list:
 * - "you": your own corrections (you typed "skulls" and picked Lying Triceps
 *   Extension), used for you straight away;
 * - "approved": ones the app owner approved on the review page;
 * - "community": a library lift's synonym that 3+ people agree on.
 */
export interface LearnedAlias {
  alias: string;
  exerciseId: string;
  source: "you" | "approved" | "community";
}

/** Lowercase, punctuation to spaces, single spaces. "Skull-Crushers!" → "skull crushers". */
export function normalizeAlias(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 60).trim();
}

/** Worth learning: at least 2 characters and not just numbers. */
export function isLearnableAlias(s: string): boolean {
  const a = normalizeAlias(s);
  return a.length >= 2 && /\p{L}/u.test(a);
}

const RANK: Record<LearnedAlias["source"], number> = { you: 3, approved: 2, community: 1 };

/**
 * Adds learned synonyms to the exercises' `aliases`, so every matcher picks them
 * up. Your own correction wins over everything (it's removed from other lifts
 * for you); approved and community ones never override a lift's name or a
 * synonym another lift already has, so they can't hijack a common word.
 */
export function withLearnedAliases(exercises: Exercise[], learned: LearnedAlias[]): Exercise[] {
  if (!learned.length) return exercises;
  const best = new Map<string, LearnedAlias>();
  for (const l of learned) {
    const a = normalizeAlias(l.alias);
    const cur = best.get(a);
    if (!cur || RANK[l.source] > RANK[cur.source]) best.set(a, { ...l, alias: a });
  }
  const names = new Set(exercises.map((e) => e.name.toLowerCase()));
  const claimed = new Map<string, string>();
  for (const e of exercises) for (const a of e.aliases ?? []) claimed.set(a.toLowerCase(), e.id);
  const add = new Map<string, string[]>();
  const remove = new Set<string>();
  for (const l of best.values()) {
    if (!exercises.some((e) => e.id === l.exerciseId) || names.has(l.alias)) continue;
    const owner = claimed.get(l.alias);
    if (owner === l.exerciseId) continue;
    if (owner && l.source !== "you") continue;
    if (owner) remove.add(l.alias);
    add.set(l.exerciseId, [...(add.get(l.exerciseId) ?? []), l.alias]);
  }
  return exercises.map((e) => {
    const extra = add.get(e.id) ?? [];
    const kept = (e.aliases ?? []).filter((a) => !remove.has(a.toLowerCase()) || extra.includes(a.toLowerCase()));
    return extra.length || kept.length !== (e.aliases ?? []).length ? { ...e, aliases: [...kept, ...extra] } : e;
  });
}

/**
 * Best guesses for a name that didn't match, so a menu has the right lift near
 * the top. Typos in single words count too ("bicpe" ~ "biceps").
 */
export function rankLifts(query: string | null, exercises: Exercise[], preferIds: string[] = [], limit = 25): Exercise[] {
  const q = (query ?? "").toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);
  const score = (e: Exercise) => {
    const n = e.name.toLowerCase();
    const nameWords = [...n.split(/[\s()\-]+/), ...(e.aliases ?? []).flatMap((a) => a.toLowerCase().split(/\s+/))].filter(Boolean);
    let sc = preferIds.includes(e.id) ? 5 : 0;
    if (q && n.startsWith(q)) sc += 40;
    if (q && n.includes(q)) sc += 20;
    for (const w of words) {
      if (n.includes(w)) sc += 10;
      else if (nameWords.some((x) => editDistance(w, x, typoAllowance(w.length)) <= typoAllowance(w.length))) sc += 8;
    }
    if (q && n.split(/\s+/).some((w) => w[0] === q[0])) sc += 2;
    return sc;
  };
  return [...exercises].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Rows from the learned_aliases / learned_aliases_for SQL functions. */
export function toLearned(rows: { alias: string; exercise_id: string; source: string }[] | null): LearnedAlias[] {
  return (rows ?? []).flatMap((r) => (r.source === "you" || r.source === "approved" || r.source === "community" ? [{ alias: r.alias, exerciseId: r.exercise_id, source: r.source }] : []));
}
