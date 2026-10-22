export type MatchVia = "exact" | "alias" | "config" | "initials" | "prefix" | "contains" | "typo";

/**
 * Find an exercise by loose name, and say how it matched. Order: config alias
 * (config.logging.aliases), exact name, a synonym (library + learned), initials
 * ("bp" → Bench Press), prefix, substring, then a small typo ("bicep crul").
 * Callers that must be strict (import) can refuse the looser kinds.
 */
export function findExercise<T extends { name: string; aliases?: string[] }>(query: string, items: T[], aliases: Record<string, string> = {}): { item: T; via: MatchVia } | null {
  let q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return null;
  const alias = Object.entries(aliases).find(([k]) => k.toLowerCase() === q);
  if (alias) q = alias[1].toLowerCase();
  const norm = (s: string) => s.toLowerCase();
  const initials = (s: string) => s.toLowerCase().split(/[\s\-]+/).filter(Boolean).map((w) => w[0]).join("");
  const hit = (item: T | undefined, via: MatchVia) => (item ? { item, via } : null);
  const exact = items.find((e) => norm(e.name) === q);
  if (exact) return { item: exact, via: alias ? "config" : "exact" };
  return (
    hit(items.find((e) => e.aliases?.some((a) => norm(a) === q)), "alias") ??
    hit(items.find((e) => initials(e.name) === q.replace(/\s+/g, "")), "initials") ??
    hit(items.find((e) => norm(e.name).startsWith(q)), "prefix") ??
    hit(items.find((e) => norm(e.name).includes(q)), "contains") ??
    hit(typoMatch(q, items), "typo")
  );
}

export function matchExercise<T extends { name: string; aliases?: string[] }>(query: string, items: T[], aliases: Record<string, string> = {}): T | null {
  return findExercise(query, items, aliases)?.item ?? null;
}

/** How many typos a name of this length may have: none under 4 letters, 1 up to 7, then 2. */
export function typoAllowance(len: number): number {
  return len < 4 ? 0 : len < 8 ? 1 : 2;
}

/**
 * The one exercise whose name or synonym is within a typo or two of the query.
 * If two different exercises are equally close ("dumbell row" vs …), it gives
 * up rather than guess.
 */
function typoMatch<T extends { name: string; aliases?: string[] }>(q: string, items: T[]): T | undefined {
  const max = typoAllowance(q.length);
  if (!max) return undefined;
  let best: T | undefined;
  let bestD = max + 1;
  let tie = false;
  for (const e of items) {
    let d = max + 1;
    for (const n of [e.name, ...(e.aliases ?? [])]) d = Math.min(d, editDistance(q, n.toLowerCase(), max));
    if (d < bestD) [best, bestD, tie] = [e, d, false];
    else if (d === bestD && d <= max && e !== best) tie = true;
  }
  return bestD <= max && !tie ? best : undefined;
}

/**
 * Edit distance with swapped neighbours counting as one typo ("crul" → "curl").
 * Stops early once every path is over `max` (returns max + 1).
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    [prev2, prev] = [prev, cur];
  }
  return Math.min(prev[b.length], max + 1);
}
