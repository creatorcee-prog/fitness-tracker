import type { Unit } from "@/config/app.config";
import type { ImportedData, ImportedSession } from "./types";

/** Splits CSV text into rows (quotes, escaped quotes; commas, semicolons or tabs). */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  // Tabs = cells copied from Google Sheets / Excel / Numbers; semicolons = some European CSV exports.
  const count = (c: string) => firstLine.split(c).length - 1;
  const delim = count("\t") > 0 && count("\t") >= count(",") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "2023-01-15 08:30:00", "2023-01-15T08:30", "15 Jan 2023, 08:30" → date + time. */
export function parseDateTime(s: string): { date: string; time: string | null } | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return { date: `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`, time: m[4] ? `${pad(+m[4])}:${m[5]}` : null };
  m = t.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/i);
  if (m && MONTHS.includes(m[2].toLowerCase())) {
    return { date: `${m[3]}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(+m[1])}`, time: m[4] ? `${pad(+m[4])}:${m[5]}` : null };
  }
  m = t.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/i);
  if (m && MONTHS.includes(m[1].toLowerCase())) {
    return { date: `${m[3]}-${pad(MONTHS.indexOf(m[1].toLowerCase()) + 1)}-${pad(+m[2])}`, time: m[4] ? `${pad(+m[4])}:${m[5]}` : null };
  }
  return null;
}

const num = (s: string | undefined) => {
  const v = Number((s ?? "").replace(",", ".").trim());
  return s && s.trim() && Number.isFinite(v) ? v : null;
};

/** Strong or Hevy export? (null = some other CSV, try the text reader or James). */
export function detectCsv(text: string): "strong-csv" | "hevy-csv" | null {
  const head = parseCsv(text.split(/\r?\n/, 1)[0] ?? "")[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  if (head.includes("exercise name") && head.includes("set order")) return "strong-csv";
  if (head.includes("exercise_title") && head.includes("start_time")) return "hevy-csv";
  return null;
}

/**
 * Strong ("Date, Workout Name, Exercise Name, Set Order, Weight, Reps, … RPE")
 * and Hevy ("title, start_time, exercise_title, set_type, weight_lbs|weight_kg, reps, rpe").
 * Strong doesn't say its unit, so `unit` (yours) is used unless a header says kg/lbs.
 */
export function readWorkoutCsv(text: string, unit: Unit): ImportedData {
  const format = detectCsv(text);
  const rows = parseCsv(text);
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const skipped: string[] = [];
  const sessions = new Map<string, ImportedSession>();

  const strong = format === "strong-csv";
  const iDate = strong ? col("date") : col("start_time");
  const iName = strong ? col("workout name") : col("title");
  const iEx = strong ? col("exercise name") : col("exercise_title");
  const iOrder = strong ? col("set order") : col("set_type");
  const iKg = col("weight_kg", "weight (kg)");
  const iLb = col("weight_lbs", "weight (lbs)", "weight (lb)");
  const iW = iKg >= 0 ? iKg : iLb >= 0 ? iLb : col("weight");
  const wUnit: Unit = iKg >= 0 ? "kg" : iLb >= 0 ? "lb" : unit;
  const iReps = col("reps");
  const iRpe = col("rpe");

  rows.forEach((r, n) => {
    const when = parseDateTime(r[iDate] ?? "");
    const exercise = (r[iEx] ?? "").trim();
    const reps = num(r[iReps]);
    if (!when || !exercise) return void skipped.push(`Row ${n + 2}: no date or exercise`);
    if (reps == null || reps <= 0) return void skipped.push(`Row ${n + 2}: ${exercise} has no reps (cardio/timed sets aren't imported)`);
    const name = (r[iName] ?? "").trim() || null;
    const key = `${when.date} ${when.time ?? ""} ${name ?? ""}`;
    const s = sessions.get(key) ?? { date: when.date, time: when.time, dayName: name, sets: [] };
    sessions.set(key, s);
    const order = (r[iOrder] ?? "").trim().toLowerCase();
    const rpe = num(r[iRpe]);
    s.sets.push({
      exercise, weight: Math.max(0, num(r[iW]) ?? 0), unit: wUnit, reps: Math.round(reps),
      rpe: rpe != null && rpe > 0 && rpe <= 10 ? rpe : null, warmup: order === "w" || order === "warmup",
    });
  });
  return { format: format ?? "strong-csv", sessions: [...sessions.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), program: null, goals: [], skipped };
}

// ------------------------------------------------------------------ program tables

const WEEKDAY: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
/** Common gym shorthand for day focus. Unknown codes are kept as written (rename them in the preview). */
const FOCUS: Record<string, string> = {
  ch: "Chest", bk: "Back", lg: "Legs", sh: "Shoulders", ar: "Arms", ps: "Push", pl: "Pull", ul: "Upper", ll: "Lower",
  ub: "Upper", lb: "Lower", fb: "Full Body", ab: "Abs", co: "Core", cd: "Cardio",
};
/** Looks like a code ("RE", "PPL2") rather than a name: asked about instead of guessed. */
const isCode = (s: string) => /^[A-Za-z]{1,4}\d?$/.test(s) && s === s.toUpperCase();

/**
 * A plan laid out as a table, one row per exercise: a day column (MON, Day 1,
 * Push…) and an exercise column, plus any of weight, sets, reps, focus/name,
 * section, detail/notes. No dates, so it's a program, not history.
 */
export function isProgramCsv(text: string): boolean {
  const head = parseCsv(text.split(/\r?\n/, 1)[0] ?? "")[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  return head.some((h) => /^(day|weekday|day of week)$/.test(h)) && head.some((h) => /^(exercise|exercise name|lift|movement)$/.test(h)) && !head.some((h) => /date|start_time/.test(h));
}

/** "40lbs", "100 kg", "135" → weight; "30s", "1:30", "2 min" → a time note. */
export function parseLoad(raw: string, unit: Unit): { weight: number | null; unit: Unit; note: string | null } {
  const s = raw.trim();
  if (!s) return { weight: null, unit, note: null };
  const w = s.match(/^(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)?$/i);
  if (w) return { weight: Number(w[1]), unit: w[2] ? (w[2].toLowerCase().startsWith("kg") ? "kg" : "lb") : unit, note: null };
  return { weight: null, unit, note: s }; // a time ("30s") or anything else: keep it as written
}

export function readProgramCsv(text: string, unit: Unit, defaults: { sets: number; reps: string }): ImportedData {
  const rows = parseCsv(text);
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iDay = col(/^(day|weekday|day of week)$/), iEx = col(/^(exercise|exercise name|lift|movement)$/);
  const iFocus = col(/^(focus|name|workout|title|muscle|muscles|split)$/), iW = col(/^(weight|load|kg|lbs?)$/);
  const iSets = col(/^sets?$/), iReps = col(/^(reps?|rep range)$/), iDetail = col(/^(detail|details|notes?|comment|comments)$/);
  const skipped: string[] = [];
  const days: NonNullable<ImportedData["program"]>["days"] = [];

  rows.forEach((r, n) => {
    const dayRaw = (r[iDay] ?? "").trim();
    const name = (r[iEx] ?? "").trim();
    if (!dayRaw || !name) return void skipped.push(`Row ${n + 2}: no day or exercise`);
    const wd = WEEKDAY[dayRaw.slice(0, 3).toLowerCase()];
    const focusRaw = (r[iFocus] ?? "").replace(/[/\\|]+\s*$/, "").trim();
    const known = FOCUS[focusRaw.toLowerCase()];
    const focus = known ?? focusRaw;
    const key = dayRaw.toLowerCase();
    let day = days.find((d) => (d as { key?: string }).key === key);
    if (!day) {
      const dayName = focus || (wd !== undefined ? dayRaw.slice(0, 1).toUpperCase() + dayRaw.slice(1, 3).toLowerCase() : dayRaw);
      day = Object.assign({ name: dayName, weekday: wd ?? null, exercises: [], code: !known && isCode(focusRaw) ? focusRaw : null }, { key });
      days.push(day);
    }
    const load = parseLoad(r[iW] ?? "", unit);
    const detail = (r[iDetail] ?? "").trim();
    // A detail like "3x10" is sets × reps; anything else ("x2" = a pair of dumbbells) is kept as a note.
    const sr = detail.match(/^(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*-\s*\d{1,3})?)$/);
    const sets = Number(r[iSets]) || (sr ? Number(sr[1]) : 0);
    const reps = (r[iReps] ?? "").replace(/\s/g, "") || (sr ? sr[2].replace(/\s/g, "") : "");
    // "x2" is ambiguous (a pair of dumbbells? 2 sets?): kept aside and asked about. Other details are notes.
    const unclear = !sr && /^[x×]\s*\d{1,2}$/i.test(detail) ? detail.replace(/\s/g, "").toLowerCase().replace("×", "x") : null;
    const note = [load.note, sr || unclear ? null : detail].filter(Boolean).join(" · ") || null;
    day.exercises.push({
      name, sets: sets > 0 && sets <= 10 ? sets : defaults.sets, reps: /^\d{1,3}(-\d{1,3})?$/.test(reps) ? reps : defaults.reps,
      stated: sets > 0 && !!reps, setsStated: sets > 0, weight: load.weight, unit: load.unit, note, detail: unclear,
    });
  });

  // Same label on different weekdays (two "Recovery" days) → add the weekday so they stay distinct.
  const dupes = new Set(days.map((d) => d.name).filter((n, i, all) => all.indexOf(n) !== i));
  for (const d of days) {
    if (d.weekday != null && dupes.has(d.name)) d.name = `${d.name} (${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.weekday]})`;
    delete (d as { key?: string }).key;
  }
  const weekly = days.length > 0 && days.every((d) => d.weekday != null) && new Set(days.map((d) => d.weekday)).size === days.length;
  return {
    format: "program-csv", sessions: [], goals: [], skipped,
    program: days.length ? { name: "Imported program", mode: weekly ? "weekly" : "rotation", days: days.map((d) => ({ ...d, weekday: weekly ? d.weekday : null })), source: "stated" } : null,
  };
}
