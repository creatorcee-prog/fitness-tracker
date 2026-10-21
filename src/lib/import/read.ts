import type { Unit } from "@/config/app.config";
import { detectCsv, isProgramCsv, readProgramCsv, readWorkoutCsv } from "./csv";
import { readWorkoutText } from "./text";
import type { ImportedData } from "./types";

/** Where the chat hands pasted workout notes over to the Import page. */
export const IMPORT_DRAFT_KEY = "ft:import-draft";

/**
 * One entry point for whatever was pasted or uploaded: a Strong/Hevy export,
 * a program table (CSV or cells copied from a spreadsheet), or notes. Free
 * and exact; `needsJames` says when the result is too thin to trust, so the
 * page can hand the text to James without the user picking a format.
 */
export function readAnything(text: string, unit: Unit, now: Date, defaults: { sets: number; reps: string }): { data: ImportedData; needsJames: boolean } {
  const data = detectCsv(text) ? readWorkoutCsv(text, unit)
    : isProgramCsv(text) ? readProgramCsv(text, unit, defaults)
    : readWorkoutText(text, unit, now);
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
  const found = data.sessions.length + (data.program?.days.length ?? 0) + data.goals.length;
  // Nothing read, or a lot left over: the format isn't one the readers know.
  const needsJames = found === 0 || data.skipped.length > Math.max(3, lines * 0.3);
  return { data, needsJames };
}
