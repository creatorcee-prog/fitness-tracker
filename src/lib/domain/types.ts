import type { Category, SplitMode, Unit } from "@/config/app.config";

export type ID = string;

export interface Profile {
  id: ID;
  displayName: string;
  unit: Unit;
  timezone: string;
  /** From the first sign-in setup (see domain/about.ts). */
  about?: import("./about").About;
  /** When the first sign-in setup was finished or skipped (null = not yet). */
  onboardedAt?: string | null;
  /** Weather nudges for runs and walks (opt-in; see domain/weather.ts). */
  weather?: import("./weather").WeatherPrefs;
  /** Invite nudges from James (see domain/invites.ts) and how many people you brought in. */
  invites?: { nudges: boolean; nudgedAt: string | null; recruits: number };
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
  /** Other names people use for it ("RDL", "stiff leg deadlift"); matched like the name. */
  aliases?: string[];
}

export interface SplitDayExercise {
  exerciseId: ID;
  order: number;
  targetSets: number;
  repRange: string;
  /** Where to start before there's any history (kg), e.g. from an imported program. */
  startWeightKg?: number | null;
  /** Short note shown with the exercise ("30s", "x2 dumbbells"). */
  note?: string | null;
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
  /** Your private label for this friend (shown instead of their name). */
  nickname?: string | null;
  /** "hidden" = friend turned off status sharing. */
  kind: "day" | "rest" | "no-split" | "hidden";
  dayName: string | null;
  /** Working sets logged today (friend's timezone); null when hidden. */
  setsToday: number | null;
  lastSessionAt: string | null;
  /** Profile photo (data URL), when they've set one. */
  avatar?: string | null;
}

/** Profile photo and banner as small data URLs (resized in the browser). */
export interface ProfileMedia {
  avatar: string | null;
  banner: string | null;
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

export interface FriendProfile {
  id: ID;
  displayName: string;
  nickname: string | null;
  /** False when the friend turned off sharing: only the name is available. */
  shared: boolean;
  avatar?: string | null;
  banner?: string | null;
  unit?: "lb" | "kg";
  today?: { kind: FriendStatus["kind"]; dayName: string | null; setsToday: number | null };
  lastSessionAt?: string | null;
  sessionsThisWeek?: number;
  sessions30d?: number;
  splitName?: string | null;
  recentPrs?: { exercise: string; type: "weight" | "e1rm"; weightKg: number; reps: number; valueKg: number; achievedAt: string }[];
  topLifts?: { exercise: string; e1rmKg: number }[];
}

export interface NutritionEntry {
  id: ID;
  /** User's local date, YYYY-MM-DD. */
  date: string;
  calories: number;
  proteinG: number | null;
  note: string | null;
  createdAt: string;
}

export interface NutritionTargets {
  calories: number | null;
  protein: number | null;
}
