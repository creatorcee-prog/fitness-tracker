import type { SplitMode, Unit } from "@/config/app.config";
import type { AccountAction } from "@/lib/ai/actions";

/**
 * Workout history read from somewhere else (a Strong/Hevy CSV, notes, a
 * spreadsheet paste), before it's saved. Names are kept as written; matching
 * to your lifts happens in build.ts, and nothing is saved until you confirm.
 */
export interface ImportedSet {
  exercise: string;
  weight: number;
  unit: Unit;
  reps: number;
  rpe: number | null;
  warmup: boolean;
}

export interface ImportedSession {
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Local time HH:MM if known. */
  time: string | null;
  /** The workout's own label ("Push", "Leg day", "Upper A"), if it had one. */
  dayName: string | null;
  sets: ImportedSet[];
}

export interface ImportedProgram {
  name: string;
  mode: SplitMode;
  days: ProgramDay[];
  /** "stated": written out in the source. "inferred": rebuilt from the logged sessions. */
  source: "stated" | "inferred";
}

export interface ProgramDay {
  name: string;
  weekday: number | null;
  exercises: ProgramExercise[];
  /** The source's own label when it's a code we couldn't expand ("RE"); asked about in the preview. */
  code?: string | null;
}

export interface ProgramExercise {
  name: string;
  sets: number;
  reps: string;
  /** False when the source didn't say (defaults were filled in; the preview says so). */
  stated?: boolean;
  /** Working weight from the source, if any. */
  weight?: number | null;
  unit?: "lb" | "kg";
  /** Anything else it said about the lift ("30s", "x2"). */
  note?: string | null;
  /** Sets came from the source or an answer (a sets/reps default won't overwrite them). */
  setsStated?: boolean;
  /** Position in the source day (the preview uses it to keep edits on the right row). */
  srcIndex?: number;
  /** An unclear detail as written ("x2"), until a question about it is answered. */
  detail?: string | null;
}

export type GoalAction = Extract<AccountAction, { type: "add_goal" }>;

export interface ImportedData {
  format: "strong-csv" | "hevy-csv" | "program-csv" | "text" | "ai";
  sessions: ImportedSession[];
  program: ImportedProgram | null;
  goals: GoalAction[];
  /** Lines or rows that couldn't be read, shown in the preview so nothing disappears silently. */
  skipped: string[];
  /** Unclear terms James flagged instead of guessing (codes, abbreviations), with his suggestions. */
  terms?: { term: string; options: string[] }[];
}
