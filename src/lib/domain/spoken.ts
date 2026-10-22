/**
 * Voice logging: turn what the phone's speech recognition heard into the
 * shorthand the quick box already understands. No AI, just patterns, and the
 * result goes into the box for you to check before it's logged.
 *
 *   "185 for 5"                    → "185x5"
 *   "bench 185 pounds for 5 reps"  → "bench 185lb x5"
 *   "3 sets of 5 at 185"           → "185x5x3"
 *   "5 reps at 80 kilos"           → "80kg x5"
 *   "one eighty five by five"      → "185x5"
 *   "225 for 5 at RPE 8"           → "225x5@8"
 */
const ONES: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
// Recognizers often hear these instead of the numbers.
const HOMOPHONES: Record<string, string> = { to: "two", too: "two", for: "for", fore: "four", won: "one", ate: "eight" };

/** Spelled-out numbers to digits. "one eighty five" (how people say weights) → 185; "two hundred twenty five" → 225. */
function wordsToDigits(text: string): string {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let i = 0;
  const isNum = (w: string | undefined) => w != null && (w in ONES || w in TENS || w === "hundred");
  while (i < words.length) {
    if (!isNum(words[i])) {
      out.push(words[i++]);
      continue;
    }
    // Read a run of number words.
    const run: string[] = [];
    while (isNum(words[i]) || (run.length && words[i] === "and" && isNum(words[i + 1]))) {
      if (words[i] !== "and") run.push(words[i]);
      i++;
    }
    out.push(String(runValue(run)));
  }
  return out.join(" ");
}

function runValue(run: string[]): number {
  // "one eighty five" style: a single digit followed by a tens group → hundreds.
  const small = (ws: string[]) => ws.reduce((n, w) => n + (ONES[w] ?? TENS[w] ?? 0), 0);
  const h = run.indexOf("hundred");
  if (h >= 0) return (h === 0 ? 1 : small(run.slice(0, h))) * 100 + small(run.slice(h + 1));
  if (run.length >= 2 && run[0] in ONES && ONES[run[0]] < 10 && run[1] in TENS) return ONES[run[0]] * 100 + small(run.slice(1));
  return small(run);
}

export function spokenToShorthand(heard: string): string | null {
  let s = ` ${heard.toLowerCase().replace(/[.,!?]/g, " ")} `;
  s = s.replace(/\b(\w+)\b/g, (w) => (w in HOMOPHONES && HOMOPHONES[w] !== "for" ? HOMOPHONES[w] : w));
  s = ` ${wordsToDigits(s.trim())} `;
  s = s
    .replace(/\b(pounds?|lbs?)\b/g, "lb")
    .replace(/\b(kilos?|kilograms?|kgs?)\b/g, "kg")
    .replace(/\brpe\s*(\d+(?:\.\d+)?)/g, "@$1")
    .replace(/\bat\s+@/g, "@")
    .replace(/\s+/g, " ")
    .trim();

  const W = String.raw`(\d+(?:\.\d+)?)\s*(lb|kg)?`;
  const RPE = String.raw`(?:\s*@\s*(\d+(?:\.\d+)?))?`;
  const fmt = (lift: string, w: string, u: string | undefined, reps: string, sets?: string, rpe?: string) =>
    `${lift ? `${lift} ` : ""}${w}${u ?? ""}${u ? " " : ""}x${reps}${sets && sets !== "1" ? `x${sets}` : ""}${rpe ? `@${rpe}` : ""}`.trim();

  // "3 sets of 5 at 185", "3 sets of 5 reps at 185 lb"
  let m = s.match(new RegExp(String.raw`^(.*?)\s*(\d+) sets? of (\d+)(?: reps?)? (?:at|with) ${W}${RPE}$`));
  if (m) return fmt(m[1], m[4], m[5], m[3], m[2], m[6]);
  // "5 reps at 185"
  m = s.match(new RegExp(String.raw`^(.*?)\s*(\d+) reps? (?:at|with) ${W}${RPE}$`));
  if (m) return fmt(m[1], m[3], m[4], m[2], undefined, m[5]);
  // "185 for 5 (reps) (for 3 sets)", "185 by 5", "185 times 5", "185 x 5"
  m = s.match(new RegExp(String.raw`^(.*?)\s*${W} (?:for|by|times|x|×) (\d+)(?: reps?)?(?: (?:for |x )?(\d+) sets?)?${RPE}$`));
  if (m) return fmt(m[1], m[2], m[3], m[4], m[5], m[6]);
  return null;
}
