import { parseShorthand, type ParsedSet } from "./shorthand";

/**
 * Plain-text set parser for Discord /log (no AI). Understands the existing
 * shorthand plus the ways people actually type sets:
 *
 *   "4x8 bench 185"         4 sets × 8 reps at 185
 *   "bench 185 4x8"         same
 *   "squat 3x5 @ 225"       3 × 5 at 225 ("@" = weight when no other weight is given)
 *   "squat 3 sets of 5 at 225"
 *   "deadlift 405x3"        1 set: weight × reps (shorthand)
 *   "bench 100kg 3x5"       kg suffix overrides the user's unit
 *   "bench 185x5 @8"        "@" after a weight is RPE
 *
 * Rule for "AxB": with a separate weight anywhere it means sets × reps;
 * without one it means weight × reps.
 */
export type FreeTextResult =
  | { ok: true; exercise: string | null; sets: ParsedSet[] }
  | { ok: false; reason: "empty" | "no-numbers" | "missing-weight" | "unclear" | "too-many-sets" };

const MAX_SETS = 20;
const MAX_REPS = 50;
const UNIT = /^(kg|kgs|lb|lbs)$/i;
const FILLER = /^(x|×|sets?|reps?|of|at|for|with|and|@)$/i;

export function parseFreeText(input: string): FreeTextResult {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) return { ok: false, reason: "empty" };
  if (!/\d/.test(text)) return { ok: false, reason: "no-numbers" };

  // 1) The established shorthand handles "bench 185x5", "185 5,5,4", "185x5x3", "100kg x5 @8"…
  // Its results are only trusted when plausible ("squat 3x5 @ 225" is not RPE 225; "bench 185 225" is not 225 reps).
  const sh = parseShorthand(text);
  const plausible = sh && sh.sets.every((x) => x.reps <= MAX_REPS && (x.rpe == null || x.rpe <= 10));
  if (sh && plausible) return sh.sets.length > MAX_SETS ? { ok: false, reason: "too-many-sets" } : { ok: true, exercise: sh.exercise, sets: sh.sets };

  // 2) Free order: pull out the pieces, whatever order they come in.
  let unit = null as "lb" | "kg" | null; // assigned inside replace() callbacks, so annotate with `as`
  let s = text.toLowerCase();
  s = s.replace(/(\d)\s*(kg|kgs|lb|lbs)\b/g, (_, d: string, u: string) => {
    unit = u.startsWith("kg") ? "kg" : "lb";
    return d;
  });

  let sets = null as number | null;
  let reps = null as number | null;
  let weight = null as number | null;
  let rpe = null as number | null;

  // "3 sets of 5" / "3 sets x 5"
  s = s.replace(/\b(\d+)\s*sets?\s*(?:of|x|×)\s*(\d+)\s*(?:reps?)?/, (_, a: string, b: string) => {
    sets = Number(a);
    reps = Number(b);
    return " ";
  });
  // "4x8" (sets × reps when a separate weight exists; decided below)
  let pair = null as [number, number] | null;
  if (sets == null) {
    s = s.replace(/\b(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+)\b/, (_, a: string, b: string) => {
      pair = [Number(a), Number(b)];
      return " ";
    });
  }
  // "@ 225" / "at 225"
  let atValue = null as number | null;
  s = s.replace(/(?:@|\bat\b)\s*(\d+(?:\.\d+)?)/, (_, a: string) => {
    atValue = Number(a);
    return " ";
  });
  // Remaining bare numbers: the weight.
  const nums = [...s.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((m) => Number(m[0]));
  s = s.replace(/\b\d+(?:\.\d+)?\b/g, " ");

  if (nums.length > 1) return { ok: false, reason: "unclear" };
  if (nums.length === 1) weight = nums[0];
  if (atValue != null) {
    if (weight == null) weight = atValue;
    else if (atValue <= 10) rpe = atValue;
    else return { ok: false, reason: "unclear" };
  }
  if (pair) {
    const [a, b] = pair;
    if (weight != null) {
      sets = a;
      reps = b;
    } else {
      // No separate weight: "AxB" is weight × reps, e.g. "deadlift 405 x 3".
      weight = a;
      reps = b;
      sets = 1;
    }
  }
  if (reps == null) return { ok: false, reason: "unclear" };
  if (weight == null) return { ok: false, reason: "missing-weight" };
  const n = sets ?? 1;
  if (!(n >= 1) || !(reps >= 1) || !(weight >= 0) || !Number.isInteger(n) || !Number.isInteger(reps)) return { ok: false, reason: "unclear" };
  if (n > MAX_SETS) return { ok: false, reason: "too-many-sets" };
  if (reps > MAX_REPS) return { ok: false, reason: "unclear" };

  const words = s.split(" ").filter((w) => w && !UNIT.test(w) && !FILLER.test(w) && /^[a-z][a-z'\-]*$/.test(w));
  const exercise = words.length ? words.join(" ") : null;
  return { ok: true, exercise, sets: Array.from({ length: n }, () => ({ weight: weight!, reps: reps!, rpe, unit })) };
}

export const FREETEXT_HELP =
  "Try `bench 185x5`, `4x8 bench 185`, `bench 185 4x8`, `squat 3x5 @ 225`, `deadlift 405x3` or `bench 100kg 3x5`.";
