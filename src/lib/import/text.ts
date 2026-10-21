import type { Unit } from "@/config/app.config";
import { parseFreeText } from "@/lib/domain/freetext";
import { toKg, fromKg } from "@/lib/domain/units";
import type { GoalAction, ImportedData, ImportedProgram, ImportedSession } from "./types";

/**
 * Reads a plain workout log, the way people keep one in Notes or a doc:
 *
 *   Oct 14 - Push                 date (any common format) + optional day name
 *   Bench press 185x5x3           sets, in the shorthand /log understands
 *   OHP: 115 8,8,7
 *   Incline DB press              an exercise header…
 *   60x10, 60x9                   …followed by its sets
 *   Pull-ups 3x10                 bodyweight lifts: sets × reps
 *   Goal: bench 225 by 2027-03-01
 *
 * A plan without dates ("Push" then "Bench 4x6-8" lines) is read as your
 * program. Anything it can't place is listed in `skipped`, never dropped silently.
 * Messier input is what "Have James read it" is for.
 */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|nesday|sday|urday|rsday)?\b\.?,?/gi;
const BODYWEIGHT = /pull[\s-]?ups?|chin[\s-]?ups?|dips?|push[\s-]?ups?|sit[\s-]?ups?|muscle[\s-]?ups?|inverted rows?|hanging leg raises?|lunges?|burpees?|crunch(es)?|bodyweight|\bbw\b/i;
/** "Bench 4x6-8", "Rows 3 x 10-12", "Plank 3x60" with no weight: a plan line. */
const PLAN = /^(.*?[a-z].*?)[\s:–-]+(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\s*(?:reps?)?$/i;

const pad = (n: number) => String(n).padStart(2, "0");

/** Finds a date in a line. Year-less dates take the latest year that isn't in the future. */
export function findDate(line: string, now: Date): { date: string; rest: string } | null {
  const y = now.getFullYear();
  const pick = (mo: number, d: number, yr?: number) => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    let year = yr ?? y;
    if (year < 100) year += 2000;
    if (!yr && new Date(year, mo - 1, d) > now) year -= 1;
    return `${year}-${pad(mo)}-${pad(d)}`;
  };
  const tries: [RegExp, (m: RegExpMatchArray) => string | null][] = [
    [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => pick(+m[2], +m[3], +m[1])],
    [/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/, (m) => pick(+m[1], +m[2], m[3] ? +m[3] : undefined)],
    [/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/i, (m) => (MONTHS.includes(m[1].toLowerCase()) ? pick(MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2], m[3] ? +m[3] : undefined) : null)],
    [/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?(?:,?\s+(\d{4}))?\b/i, (m) => (MONTHS.includes(m[2].toLowerCase()) ? pick(MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1], m[3] ? +m[3] : undefined) : null)],
  ];
  for (const [re, f] of tries) {
    const m = line.match(re);
    if (!m) continue;
    const date = f(m);
    if (!date) continue;
    const rest = line.replace(m[0], " ").replace(WEEKDAYS, " ").replace(/^[\s:–—|,.-]+|[\s:–—|,.-]+$/g, "").replace(/\s{2,}/g, " ").trim();
    // A date line has no other numbers ("5/5/5" is reps, not a date).
    if (/\d/.test(rest.replace(/^(day|week)\s*\d+\b/i, ""))) return null;
    return { date, rest };
  }
  return null;
}

/** "Goal: bench 225 by 2027-03-01", "goal - 4 sessions a week", "goal: 12 pull-ups". */
export function parseGoalLine(line: string, unit: Unit, now: Date): GoalAction | null {
  const m = line.match(/^\s*(?:[-*•]\s*)?(?:goals?|target)\s*[:–-]?\s*(.+)$/i);
  if (!m) return null;
  let text = m[1].trim();
  let deadline: string | undefined;
  const by = text.match(/\s+by\s+(.+)$/i);
  if (by) {
    const d = findDate(by[1], new Date(now.getTime() + 3 * 365 * 86_400_000));
    if (d) deadline = d.date;
    text = text.slice(0, by.index).trim();
  }
  const sessions = text.match(/^(\d)\s*(?:sessions?|workouts?|days?|times?)\s*(?:a|per|\/)\s*week$/i);
  if (sessions) return { type: "add_goal", goal: "sessions_per_week", target: +sessions[1] };
  const reps = text.match(/^(\d{1,3})\s*(?:reps?\s*(?:of|on)?\s*)?(.+?)(?:\s*(?:@|at)\s*(\d+(?:\.\d+)?)\s*(kg|lbs?)?)?$/i);
  if (reps && BODYWEIGHT.test(reps[2])) {
    const w = reps[3] ? convert(+reps[3], reps[4], unit) : 0;
    return { type: "add_goal", goal: "lift_reps", lift: tidy(reps[2]), target: +reps[1], weight: w, ...(deadline ? { deadline } : {}) };
  }
  const lift = text.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(kg|lbs?)?$/i);
  if (lift) return { type: "add_goal", goal: "lift_e1rm", lift: tidy(lift[1]), target: convert(+lift[2], lift[3], unit), ...(deadline ? { deadline } : {}) };
  return null;
}

const convert = (v: number, u: string | undefined, to: Unit) => {
  const from: Unit | null = u ? (u.toLowerCase().startsWith("kg") ? "kg" : "lb") : null;
  return from && from !== to ? Number(fromKg(toKg(v, from), to).toFixed(1)) : v;
};
/** "bench press:" → "Bench press" (keeps the user's words, tidies case and punctuation). */
const tidy = (s: string) => {
  const t = s.replace(/^[\s\-*•\d.)]+(?=[a-z])/i, "").replace(/[:\s–-]+$/, "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
};
const stripBullet = (s: string) => s.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s+/, "").trim();

/** One line as sets, if it is one. `header` is the exercise from a line above when this line has none. */
function readSets(line: string, header: string | null, unit: Unit): { exercise: string; sets: { weight: number; unit: Unit; reps: number; rpe: number | null }[] } | null {
  const text = stripBullet(line).replace(/:\s*/, " ");
  // Bodyweight "Pull-ups 3x10": sets × reps, no weight. (The shorthand would read 3 as the weight.)
  const plan = text.match(PLAN);
  if (plan && BODYWEIGHT.test(plan[1]) && !/[-–]/.test(plan[3])) {
    return { exercise: tidy(plan[1]), sets: Array.from({ length: +plan[2] }, () => ({ weight: 0, unit, reps: +plan[3], rpe: null })) };
  }
  const r = parseFreeText(text);
  if (!r.ok) return null;
  const exercise = r.exercise ? tidy(r.exercise) : header;
  if (!exercise) return null;
  return { exercise, sets: r.sets.map((s) => ({ weight: s.weight, unit: s.unit ?? unit, reps: s.reps, rpe: s.rpe })) };
}

export function readWorkoutText(input: string, unit: Unit, now: Date): ImportedData {
  const lines = input.split(/\r?\n/).map((l) => l.trim());
  const sessions: ImportedSession[] = [];
  const goals: GoalAction[] = [];
  const skipped: string[] = [];
  const plan: ImportedProgram["days"] = [];
  let cur: ImportedSession | null = null;
  let header: string | null = null;
  let planDay: ImportedProgram["days"][number] | null = null;
  let pendingLabel: string | null = null;

  const nextIsSetsOnly = (i: number) => {
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j]) continue;
      const r = parseFreeText(stripBullet(lines[j]));
      return r.ok && !r.exercise;
    }
    return false;
  };

  lines.forEach((raw, i) => {
    if (!raw || /^[-=_*#\s]+$/.test(raw)) return;
    const line = raw.replace(/^#+\s*/, "");

    const goal = parseGoalLine(line, unit, now);
    if (goal) return void goals.push(goal);
    if (/^\s*(?:goals?|target)\b/i.test(line)) return void skipped.push(raw);

    const d = findDate(line, now);
    if (d) {
      const label = d.rest.replace(/\bday\s*\d+\b[\s:–-]*/i, "").replace(/\s*day$/i, "").trim() || pendingLabel;
      cur = { date: d.date, time: null, dayName: label ? tidy(label) : null, sets: [] };
      sessions.push(cur);
      header = null;
      planDay = null;
      pendingLabel = null;
      return;
    }

    // Plan lines ("Bench 4x6-8") outside a dated session build the stated program.
    const pm = stripBullet(line).match(PLAN);
    if (!cur && pm && (planDay || pendingLabel)) {
      if (!planDay) {
        planDay = { name: tidy(pendingLabel!), weekday: null, exercises: [] };
        plan.push(planDay);
        pendingLabel = null;
      }
      planDay.exercises.push({ name: tidy(pm[1]), sets: +pm[2], reps: pm[3].replace(/\s|–/g, (c) => (c === "–" ? "-" : "")) });
      return;
    }

    if (!/\d/.test(line.replace(/^(day|week)\s*\d+\b/i, ""))) {
      // A line with no numbers: an exercise header (its sets follow) or a day name.
      if (cur && nextIsSetsOnly(i)) return void (header = tidy(line));
      if (/^week\s*\d+\b/i.test(line)) return;
      const label = line.replace(/^day\s*\d+\b[\s:–-]*/i, "").replace(/[:\s]+$/, "").trim() || line;
      if (cur && cur.sets.length === 0 && !cur.dayName) return void (cur.dayName = tidy(label.replace(/\s*day$/i, "")));
      // Inside a workout, a wordy line is a note, unless a date or a plan follows (then it names the next day).
      const next = lines.slice(i + 1).find((l) => l);
      const startsDay = !cur || (!!next && (findDate(next, now) !== null || PLAN.test(stripBullet(next))));
      if (!startsDay) return void skipped.push(raw);
      pendingLabel = label.replace(/\s*day$/i, "");
      planDay = null;
      if (cur && next && !findDate(next, now)) cur = null; // a plan follows: leave the dated workout
      return;
    }

    const sets = readSets(line, header, unit);
    if (sets && cur) {
      header = sets.exercise;
      for (const s of sets.sets) cur.sets.push({ exercise: sets.exercise, ...s, warmup: false });
      return;
    }
    skipped.push(sets && !cur ? `${raw}  (no date above it)` : raw);
  });

  const kept = sessions.filter((s) => s.sets.length);
  const program: ImportedProgram | null = plan.some((d) => d.exercises.length) ? { name: "Imported program", mode: "rotation", days: plan.filter((d) => d.exercises.length), source: "stated" } : null;
  return { format: "text", sessions: kept, program, goals, skipped };
}
