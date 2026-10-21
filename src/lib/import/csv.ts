import type { Unit } from "@/config/app.config";
import type { ImportedData, ImportedSession } from "./types";

/** Splits CSV text into rows (quotes, escaped quotes, commas or semicolons). */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
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
