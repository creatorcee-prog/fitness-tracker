import type { Category, SplitMode, Unit } from "@/config/app.config";

export type ID = string;

export interface Profile {
  id: ID;
  displayName: string;
  unit: Unit;
  timezone: string;
}

export interface Exercise {
  id: ID;
  name: string;
  category: Category;
  equipment: string | null;
  /** Stepper increment in kg; null = use config.logging.weightStep. */
  incrementKg: number | null;
  /** null = shared library exercise. */
  ownerId: ID | null;
}

export interface SplitDayExercise {
  exerciseId: ID;
  order: number;
  targetSets: number;
  repRange: string;
}

export interface SplitDay {
  id: ID;
  splitId: ID;
  position: number;
  name: string;
  /** 0 = Sunday ... 6 = Saturday; used only in weekly mode. */
  weekday: number | null;
  exercises: SplitDayExercise[];
}

export interface Split {
  id: ID;
  name: string;
  mode: SplitMode;
  isActive: boolean;
  days: SplitDay[];
}

export interface SplitState {
  splitId: ID;
  nextPosition: number;
  lastCompletedAt: string | null;
}

export interface Session {
  id: ID;
  splitDayId: ID | null;
  startedAt: string;
  finishedAt: string | null;
  source: "web" | "discord";
}

export interface SetEntry {
  id: ID;
  sessionId: ID;
  exerciseId: ID;
  setIndex: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
  note: string | null;
  createdAt: string;
}

export type PRType = "weight" | "reps_at_weight" | "e1rm" | "session_volume";

export interface PREvent {
  exerciseId: ID;
  type: PRType;
  /** kg for weight/e1rm/volume, reps for reps_at_weight. */
  value: number;
  setId: ID | null;
  sessionId: ID;
  achievedAt: string;
  weightKg: number;
  reps: number;
  /** True when there was nothing to beat (first log). Recorded, not celebrated. */
  baseline: boolean;
}

export interface FriendStatus {
  friendId: ID;
  displayName: string;
  /** "hidden" = friend turned off status sharing. */
  kind: "day" | "rest" | "no-split" | "hidden";
  dayName: string | null;
  /** Working sets logged today (friend's timezone); null when hidden. */
  setsToday: number | null;
  lastSessionAt: string | null;
}

export interface FriendRequest {
  requesterId: ID;
  displayName: string;
  createdAt: string;
}

export interface Reminder {
  id: ID;
  channel: "discord" | "push";
  /** "HH:MM" in the user's timezone. */
  localTime: string;
  /** 0 = Sunday ... 6 = Saturday. */
  days: number[];
  enabled: boolean;
  lastSentOn: string | null;
  /** Why the last Discord DM failed; reminders are switched off when this is set. */
  lastError: string | null;
}

export interface AnnounceSettings {
  enabled: boolean;
  /** True once /announce on has been run in a server channel. */
  channelSet: boolean;
}

/** Settings that follow the account across devices (Supabase backend). */
export type AccountPrefs = { theme?: unknown; dashboard?: unknown };
