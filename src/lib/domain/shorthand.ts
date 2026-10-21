/**
 * Shorthand set parser. No AI, just patterns.
 *
 *   "185x5"          → 1 set of 185 × 5
 *   "185x5x3"        → 3 sets of 185 × 5
 *   "185 5,5,4"      → 185 × 5, 185 × 5, 185 × 4
 *   "185x5, 195x3"   → two different sets
 *   "185x5@8"        → RPE 8
 *   "80kg x5"        → explicit unit
 *   "bench 185x5"    → exercise name prefix (used by Discord /log)
 */
export interface ParsedSet {
  weight: number;
  reps: number;
  rpe: number | null;
  unit: "lb" | "kg" | null;
}

export interface ParseResult {
  exercise: string | null;
  sets: ParsedSet[];
}

const NUM = String.raw`\d+(?:\.\d+)?`;
const UNIT = String.raw`(?:\s*(kg|kgs|lb|lbs))?`;
const RPE = String.raw`(?:\s*@\s*(${NUM}))?`;

const WxRxS = new RegExp(String.raw`^(${NUM})${UNIT}\s*[x×*]\s*(\d+)\s*[x×*]\s*(\d+)${RPE}$`, "i");
const WxR = new RegExp(String.raw`^(${NUM})${UNIT}\s*[x×*]\s*(\d+)${RPE}$`, "i");
const W_REPLIST = new RegExp(String.raw`^(${NUM})${UNIT}\s+(\d+(?:\s*,\s*\d+)+|\d+)${RPE}$`, "i");

function unitOf(u: string | undefined): "lb" | "kg" | null {
  if (!u) return null;
  return u.toLowerCase().startsWith("kg") ? "kg" : "lb";
}

function rpeOf(r: string | undefined): number | null {
  return r ? Number(r) : null;
}

function parseChunk(chunk: string): ParsedSet[] | null {
  const s = chunk.trim();
  let m = s.match(WxRxS);
  if (m) {
    const [, w, u, reps, count, rpe] = m;
    const n = Number(count);
    if (n < 1 || n > 50) return null;
    return Array.from({ length: n }, () => ({ weight: Number(w), reps: Number(reps), rpe: rpeOf(rpe), unit: unitOf(u) }));
  }
  m = s.match(WxR);
  if (m) {
    const [, w, u, reps, rpe] = m;
    return [{ weight: Number(w), reps: Number(reps), rpe: rpeOf(rpe), unit: unitOf(u) }];
  }
  m = s.match(W_REPLIST);
  if (m) {
    const [, w, u, list, rpe] = m;
    return list.split(",").map((r) => ({ weight: Number(w), reps: Number(r.trim()), rpe: rpeOf(rpe), unit: unitOf(u) }));
  }
  return null;
}

export function parseShorthand(input: string): ParseResult | null {
  const text = input.trim();
  if (!text) return null;

  // Optional exercise name: leading words before the first number.
  const nameMatch = text.match(/^([a-z][a-z \-']*?)\s+(?=\d)/i);
  const exercise = nameMatch ? nameMatch[1].trim() : null;
  const body = nameMatch ? text.slice(nameMatch[0].length) : text;

  // "185 5,5,4" contains commas that are not set separators, so only split on
  // commas that are followed by "<weight>x".
  const chunks = body.split(/[;]|,(?=\s*\d+(?:\.\d+)?\s*(?:kg|kgs|lb|lbs)?\s*[x×*])/i);
  const sets: ParsedSet[] = [];
  for (const c of chunks) {
    const parsed = parseChunk(c);
    if (!parsed) return null;
    sets.push(...parsed);
  }
  if (sets.some((s) => !(s.reps > 0) || !(s.weight >= 0))) return null;
  return { exercise, sets };
}
