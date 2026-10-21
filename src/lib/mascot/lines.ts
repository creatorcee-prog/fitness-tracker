/**
 * James's scripted lines. No AI: picked at random per event, with fill-ins
 * like {lift} or {days}. Add lines freely; `weight` makes a line more likely.
 * Persona: burly, mustached, old-school gym coach. Warm, a little gruff, never preachy.
 */
export type MascotEvent =
  | "first_visit"
  | "morning"
  | "afternoon"
  | "evening"
  | "rest_day"
  | "session_start"
  | "pr"
  | "goal_hit"
  | "streak_milestone"
  | "missed_days"
  | "comeback"
  | "workout_done";

export type Mood = "neutral" | "happy" | "proud" | "concerned";

export interface Line {
  text: string;
  weight?: number;
}

export const MOOD: Record<MascotEvent, Mood> = {
  first_visit: "happy",
  morning: "neutral",
  afternoon: "neutral",
  evening: "neutral",
  rest_day: "happy",
  session_start: "happy",
  pr: "proud",
  goal_hit: "proud",
  streak_milestone: "proud",
  missed_days: "concerned",
  comeback: "happy",
  workout_done: "happy",
};

/** Higher wins when two events want the bubble at once (one line per screen). */
export const PRIORITY: Record<MascotEvent, number> = {
  first_visit: 1, morning: 1, afternoon: 1, evening: 1, rest_day: 1,
  missed_days: 2, comeback: 3, session_start: 3, workout_done: 3, streak_milestone: 4, pr: 5, goal_hit: 6,
};

export const LINES: Record<MascotEvent, Line[]> = {
  first_visit: [
    { text: "Name's James. I'll keep count, you keep lifting. Deal?" },
    { text: "Welcome to the garage. Log a set and I'll take it from there." },
    { text: "New lifter, huh? Let's see what you've got. Start with one good set." },
  ],
  morning: [
    { text: "Morning! {day} is on the board today." },
    { text: "Early bird gets the bar. {day} day, {name}." },
    { text: "Coffee first, then {day}. I'll wait." },
    { text: "Good morning, {name}. The iron's already warmed up." },
    { text: "Rise and grind. {day} is up." },
    { text: "Morning session? Respect. {day} today." },
  ],
  afternoon: [
    { text: "Afternoon, {name}. {day} is up today." },
    { text: "Lunch digested? Good. {day} awaits." },
    { text: "Middle of the day, middle of the week, middle of the bar. {day} time." },
    { text: "{day} day. Let's make the afternoon count." },
    { text: "Afternoon slump? Nothing a few heavy sets won't fix. {day} today." },
  ],
  evening: [
    { text: "Evening, {name}. {day} is still on the board." },
    { text: "Long day? The bar doesn't care. {day} is up." },
    { text: "Night shift at the garage. {day} today." },
    { text: "Best way to end a day: {day} and a good meal after." },
    { text: "Evening session. Quiet gym, loud PRs. {day} today." },
  ],
  rest_day: [
    { text: "Rest day. Muscles grow when you're not lifting. Eat well." },
    { text: "Day off. Walk, stretch, sleep. That's the program today." },
    { text: "Recovery is training too. Put your feet up, {name}." },
    { text: "No iron today. I'll guard the plates." },
  ],
  session_start: [
    { text: "Here we go. {day}, one set at a time." },
    { text: "Warm up properly. Your joints will thank you later." },
    { text: "{day} started. I'm counting." },
    { text: "Chalk up. Let's get to work." },
    { text: "First set's the hardest. After that, it's just numbers." },
    { text: "Focus on the next set. Only the next set." },
  ],
  pr: [
    { text: "NEW PR! {lift}, {weight} × {reps}. That's what I'm talking about!", weight: 2 },
    { text: "Look at that! {lift} just went up. {weight} × {reps}." },
    { text: "Write that one down. Oh wait, I did. {lift} PR!" },
    { text: "{lift} PR. The mustache is impressed." },
    { text: "That's a record, {name}. {weight} × {reps} on {lift}." },
    { text: "Strong. Stronger than last time. {lift} PR!" },
    { text: "Ring the bell! {lift} PR, {weight} × {reps}." },
    { text: "You've never moved {lift} like that before. PR!" },
  ],
  goal_hit: [
    { text: "GOAL REACHED: {goal}. Proud of you, {name}. Set the next one." },
    { text: "{goal}. Done. Told you you'd get there." },
    { text: "Goal smashed: {goal}. Time to aim higher." },
    { text: "That's {goal} in the books. Take a second to enjoy it." },
  ],
  streak_milestone: [
    { text: "{streak} weeks in a row hitting your target. That's a habit now." },
    { text: "{streak}-week streak. Consistency beats everything." },
    { text: "Week {streak} of showing up. That's how it's done." },
    { text: "{streak} straight weeks. Most people quit by week two. Not you." },
  ],
  missed_days: [
    { text: "It's been {days} days. No lectures. Just come back for one set." },
    { text: "{days} days off. The bar misses you. So do I, a little." },
    { text: "Life happens. {days} days is nothing. {day} is waiting." },
    { text: "Haven't seen you in {days} days. Light session today? Still counts." },
  ],
  comeback: [
    { text: "Welcome back! Start a little lighter and build it up again." },
    { text: "There you are. Back under the bar where you belong." },
    { text: "The comeback starts with this set. Glad you're here." },
  ],
  workout_done: [
    { text: "Done and logged. Eat, sleep, repeat." },
    { text: "Good session. Next up: {next}." },
    { text: "That's a wrap. Hydrate, {name}." },
    { text: "Workout finished. Tomorrow's you says thanks." },
  ],
};

/** Replace {key} placeholders; unknown keys are left as a sensible blank. */
export function fill(text: string, vars: Record<string, string | number | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    return v === undefined || v === "" ? (k === "name" ? "friend" : k === "day" ? "Training" : "") : String(v);
  }).replace(/\s{2,}/g, " ").trim();
}

/**
 * Weighted random pick, avoiding the lines in `recent` when possible so it
 * doesn't repeat itself. `rand` is injectable for tests.
 */
export function pickLine(event: MascotEvent, recent: string[] = [], rand: () => number = Math.random): Line {
  const all = LINES[event];
  const pool = all.filter((l) => !recent.includes(l.text));
  const from = pool.length ? pool : all;
  const total = from.reduce((a, l) => a + (l.weight ?? 1), 0);
  let r = rand() * total;
  for (const l of from) {
    r -= l.weight ?? 1;
    if (r < 0) return l;
  }
  return from[from.length - 1];
}
