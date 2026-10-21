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
  days: { name: string; weekday: number | null; exercises: ProgramExercise[] }[];
  /** "stated": written out in the source. "inferred": rebuilt from the logged sessions. */
  source: "stated" | "inferred";
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
}

export type GoalAction = Extract<AccountAction, { type: "add_goal" }>;

export interface ImportedData {
  format: "strong-csv" | "hevy-csv" | "program-csv" | "text" | "ai";
  sessions: ImportedSession[];
  program: ImportedProgram | null;
  goals: GoalAction[];
  /** Lines or rows that couldn't be read, shown in the preview so nothing disappears silently. */
  skipped: string[];
}
