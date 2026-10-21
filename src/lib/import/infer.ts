import type { ImportedProgram, ImportedSession } from "./types";

/**
 * Rebuilds the split you were actually running from logged sessions, staying
 * faithful to them: your own day names and their order, the lifts you did
 * on each day (in your order), the usual number of working sets, and the rep
 * range you really hit. Only the last few sessions of each day count, so an
 * old version of the program doesn't leak in.
 */
const RECENT_PER_DAY = 4;
const norm = (s: string) => s.trim().toLowerCase();

const weekdayOf = (date: string) => new Date(`${date}T12:00:00`).getDay();
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
};

export function inferProgram(sessions: ImportedSession[]): ImportedProgram | null {
  const sorted = [...sessions].filter((s) => s.sets.some((x) => !x.warmup)).sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  if (!sorted.length) return null;

  // Group by the workout's own name; unnamed workouts by which lifts they contain.
  const groups = new Map<string, { name: string; sessions: ImportedSession[] }>();
  const unnamed: { lifts: Set<string>; sessions: ImportedSession[] }[] = [];
  for (const s of sorted) {
    if (s.dayName) {
      const g = groups.get(norm(s.dayName)) ?? { name: s.dayName, sessions: [] };
      g.sessions.push(s);
      groups.set(norm(s.dayName), g);
      continue;
    }
    const lifts = new Set(s.sets.map((x) => norm(x.exercise)));
    const similar = (a: Set<string>) => [...a].filter((x) => lifts.has(x)).length / new Set([...a, ...lifts]).size;
    const match = unnamed.find((u) => similar(u.lifts) >= 0.5);
    if (match) {
      match.sessions.push(s);
      lifts.forEach((l) => match.lifts.add(l));
    } else unnamed.push({ lifts, sessions: [s] });
  }
  // Unnamed one-offs are noise when there's a clear pattern.
  const keepUnnamed = unnamed.filter((u) => u.sessions.length >= 2 || sorted.length < 4);
  keepUnnamed.forEach((u, i) => groups.set(`#${i}`, { name: `Day ${String.fromCharCode(65 + i)}`, sessions: u.sessions }));
  if (!groups.size) return null;

  // Day order: as they appear in the most recent stretch of training.
  const recent = sorted.slice(-groups.size * 3);
  const firstSeen = (g: { sessions: ImportedSession[] }) => {
    const i = recent.findIndex((s) => g.sessions.includes(s));
    return i < 0 ? Infinity : i;
  };
  const ordered = [...groups.values()].sort((a, b) => firstSeen(a) - firstSeen(b) || sorted.indexOf(a.sessions[0]) - sorted.indexOf(b.sessions[0]));

  // Weekly if each day keeps to its own weekday (75%+ of the time).
  let weekly = ordered.length <= 7;
  const weekdays = ordered.map((g) => {
    const counts = new Map<number, number>();
    for (const s of g.sessions) counts.set(weekdayOf(s.date), (counts.get(weekdayOf(s.date)) ?? 0) + 1);
    const [wd, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (g.sessions.length < 2 || n / g.sessions.length < 0.75) weekly = false;
    return wd;
  });
  if (new Set(weekdays).size !== weekdays.length) weekly = false;

  const days = ordered.map((g, gi) => {
    const last = g.sessions.slice(-RECENT_PER_DAY);
    const stats = new Map<string, { name: string; positions: number[]; setCounts: number[]; reps: number[] }>();
    for (const s of last) {
      const working = s.sets.filter((x) => !x.warmup);
      const order: string[] = [];
      for (const x of working) if (!order.includes(norm(x.exercise))) order.push(norm(x.exercise));
      order.forEach((key, pos) => {
        const xs = working.filter((x) => norm(x.exercise) === key);
        const st = stats.get(key) ?? { name: xs[0].exercise, positions: [], setCounts: [], reps: [] };
        st.positions.push(pos);
        st.setCounts.push(xs.length);
        st.reps.push(...xs.map((x) => x.reps));
        stats.set(key, st);
      });
    }
    const exercises = [...stats.values()]
      // Lifts done in at least half of this day's recent sessions (all of them when there's only one).
      .filter((st) => st.setCounts.length * 2 >= last.length)
      .sort((a, b) => a.positions.reduce((x, y) => x + y, 0) / a.positions.length - b.positions.reduce((x, y) => x + y, 0) / b.positions.length)
      .map((st) => {
        const lo = Math.min(...st.reps), hi = Math.max(...st.reps);
        return { name: st.name, sets: Math.max(1, median(st.setCounts)), reps: lo === hi ? `${lo}` : `${lo}-${hi}` };
      });
    return { name: g.name, weekday: weekly ? weekdays[gi] : null, exercises };
  });

  return { name: "Imported split", mode: weekly ? "weekly" : "rotation", days, source: "inferred" };
}
