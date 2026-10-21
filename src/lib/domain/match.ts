/**
 * Find an exercise by loose name: alias (config.logging.aliases), exact, then
 * initials ("bp" → Bench Press), then prefix, then substring. Shared by the
 * shorthand box and (later) Discord /log.
 */
export function matchExercise<T extends { name: string; aliases?: string[] }>(query: string, items: T[], aliases: Record<string, string> = {}): T | null {
  let q = query.trim().toLowerCase();
  if (!q) return null;
  const alias = Object.entries(aliases).find(([k]) => k.toLowerCase() === q);
  if (alias) q = alias[1].toLowerCase();
  const norm = (s: string) => s.toLowerCase();
  const initials = (s: string) => s.toLowerCase().split(/[\s\-]+/).filter(Boolean).map((w) => w[0]).join("");
  return (
    items.find((e) => norm(e.name) === q) ??
    // The library's synonyms ("rdl", "stiff leg deadlift", "pec deck").
    items.find((e) => e.aliases?.some((a) => norm(a) === q)) ??
    items.find((e) => initials(e.name) === q.replace(/\s+/g, "")) ??
    items.find((e) => norm(e.name).startsWith(q)) ??
    items.find((e) => norm(e.name).includes(q)) ??
    null
  );
}
