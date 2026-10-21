import type { ImportedData, ImportedProgram } from "./types";

/**
 * Questions instead of guesses. When an import has something unclear (a day
 * code like "RE", a detail like "x2", missing sets and reps), the preview
 * asks; answers apply before anything is saved.
 *
 * Each question has a memory `key`. Your answers are remembered for next
 * time (per account), and answers many people gave are offered as a hint
 * ("most people: Rest").
 */
export interface ImportQuestion {
  key: string;
  prompt: string;
  options: { label: string; value: string }[];
  /** Offer a text box for your own answer (e.g. a day name). */
  allowText?: boolean;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const SETS_REPS_CHOICES = ["3x8-12", "3x5-8", "4x6-10", "3x10-15"];
export const termKey = (t: string) => `term:${t.trim().toLowerCase()}`.slice(0, 60);

export function questionsFor(data: ImportedData, program: ImportedProgram | null): ImportQuestion[] {
  const qs: ImportQuestion[] = [];
  const seen = new Set<string>();
  const add = (q: ImportQuestion) => {
    if (seen.has(q.key)) return;
    seen.add(q.key);
    qs.push(q);
  };

  // Day codes the reader couldn't expand, and terms James flagged.
  for (const d of program?.days ?? []) {
    if (!d.code) continue;
    const where = program!.days.filter((x) => x.code === d.code).map((x) => (x.weekday != null ? DOW[x.weekday] : x.name)).join(", ");
    add({
      key: termKey(d.code),
      prompt: `What does “${d.code}” mean as a day name? (${where})`,
      options: ["Rest", "Recovery", "Rear delts", "Upper", "Full Body"].map((x) => ({ label: x, value: x })),
      allowText: true,
    });
  }
  for (const t of data.terms ?? []) {
    add({ key: termKey(t.term), prompt: `What does “${t.term}” mean?`, options: t.options.map((x) => ({ label: x, value: x })), allowText: true });
  }

  // "x2"-style details.
  for (const d of program?.days ?? []) {
    for (const x of d.exercises) {
      if (!x.detail) continue;
      const n = x.detail.replace(/\D/g, "");
      add({
        key: `detail:${x.detail}`,
        prompt: `“${x.detail}” after a weight (e.g. ${x.name}${x.weight ? ` ${x.weight} ${x.unit ?? ""}`.trimEnd() : ""} ${x.detail}) means…`,
        options: [
          { label: `${n} dumbbells (weight is per hand)`, value: "pair" },
          { label: `${n} sets`, value: "sets" },
          { label: "Something else (keep it as a note)", value: "note" },
        ],
      });
    }
  }

  // Sets and reps the source didn't give.
  if (program?.days.some((d) => d.exercises.some((x) => x.stated === false))) {
    add({
      key: "setsreps",
      prompt: "Your plan doesn't list sets and reps. Start lifts without them at…",
      options: SETS_REPS_CHOICES.map((v) => ({ label: v.replace("x", " × "), value: v })),
    });
  }
  return qs;
}

/** Applies one answer to the program (pure: returns a new program). */
export function applyAnswer(program: ImportedProgram, key: string, value: string): ImportedProgram {
  const p: ImportedProgram = structuredClone(program);
  if (key.startsWith("term:")) {
    const term = key.slice(5);
    const name = value.trim().slice(0, 40);
    if (!name) return program;
    for (const d of p.days) if (d.code && d.code.toLowerCase() === term) d.name = name;
    // A term James flagged may be the whole day name.
    for (const d of p.days) if (!d.code && d.name.trim().toLowerCase() === term) d.name = name;
    // Two days with the same name on different weekdays: add the weekday so they stay distinct.
    const counts = new Map<string, number>();
    for (const d of p.days) counts.set(d.name, (counts.get(d.name) ?? 0) + 1);
    for (const d of p.days) if ((counts.get(d.name) ?? 0) > 1 && d.weekday != null) d.name = `${d.name} (${DOW[d.weekday]})`;
    return p;
  }
  if (key.startsWith("detail:")) {
    const detail = key.slice(7);
    const n = Number(detail.replace(/\D/g, ""));
    for (const d of p.days) {
      for (const x of d.exercises) {
        if (x.detail !== detail) continue;
        if (value === "pair") x.note = [x.note, `${n} dumbbells (per hand)`].filter(Boolean).join(" · ");
        else if (value === "sets" && n >= 1 && n <= 10) Object.assign(x, { sets: n, setsStated: true });
        else x.note = [x.note, detail].filter(Boolean).join(" · ");
        x.detail = null;
      }
    }
    return p;
  }
  if (key === "setsreps") {
    const m = value.match(/^(\d{1,2})x(\d{1,3}(?:-\d{1,3})?)$/);
    if (!m) return program;
    for (const d of p.days) for (const x of d.exercises) if (x.stated === false) Object.assign(x, { reps: m[2], ...(x.setsStated ? {} : { sets: Number(m[1]) }) });
    return p;
  }
  return program;
}
