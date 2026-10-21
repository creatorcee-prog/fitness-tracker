/**
 * Every tunable in the app lives here. Nothing else hard-codes a number.
 *
 * Override order (later wins):
 *   1. these defaults
 *   2. NEXT_PUBLIC_CONFIG_OVERRIDES (JSON, build time)
 *   3. per-browser overrides saved from the Settings → Config editor (localStorage)
 *
 * See src/config/runtime.ts for the merge.
 */

export type Unit = "lb" | "kg";
export type E1rmFormula = "epley" | "brzycki" | "lombardi" | "oconner";
export type SplitMode = "rotation" | "weekly";
export type DataBackend = "local" | "supabase" | "local-sync";
export type Category = "upper" | "lower" | "core" | "cardio" | "other";

export type WidgetId = "today" | "week" | "streak" | "lastPr" | "friends" | "topLift" | "volume";
export interface WidgetConfig {
  id: WidgetId;
  enabled: boolean;
  size: 1 | 2;
  color: string;
}

export const defaultConfig = {
  data: {
    /**
     * "local" keeps everything in this browser; "supabase" uses the hosted database.
     * "local-sync" (debugging) runs the offline-sync layer against a fake server in
     * this browser that fails whenever the browser is offline (DevTools → Offline).
     */
    backend: "local" as DataBackend,
    /** localStorage key prefix used by the local backend. */
    localStorageKey: "ft:data:v1",
    /**
     * Supabase backend only: keep a copy of your workout data on the device so
     * sets can be logged with no signal and synced later. false = always online.
     */
    offline: true,
    /** Register the service worker so the app itself opens without a connection. */
    serviceWorker: true,
  },

  units: {
    /** Display unit for new users. Weights are always stored in kg. */
    default: "lb" as Unit,
    /** Decimal places shown for weights. */
    displayDecimals: 1,
  },

  logging: {
    /** Stepper step for weight, per display unit. Per-exercise `increment` wins when set. */
    weightStep: { lb: 5, kg: 2.5 } as Record<Unit, number>,
    repStep: 1,
    /** Long-press duration (ms) on a stepper value before the number pad opens. */
    longPressMs: 450,
    /** Undo toast lifetime after save/delete. */
    undoToastMs: 5000,
    /** Default sets for an exercise with no plan. */
    defaultTargetSets: 3,
    defaultRepRange: "5-8",
    /** Warm-up sets never count toward PRs. */
    warmupsCountForPRs: false,
    /** Shorthand/Discord nicknames → exercise name. Initials ("bp") work without an entry. */
    aliases: { ohp: "Overhead Press", rdl: "Romanian Deadlift", dl: "Deadlift", squat: "Back Squat", pullups: "Pull-up" } as Record<string, string>,
  },

  progression: {
    enabled: true,
    /** Suggested jump when every planned rep was hit last session (display units). */
    jump: {
      lb: { upper: 5, lower: 10, core: 0, cardio: 0, other: 5 },
      kg: { upper: 2.5, lower: 5, core: 0, cardio: 0, other: 2.5 },
    } as Record<Unit, Record<Category, number>>,
    /** Conservative: never suggest an increase after a missed rep. */
    holdAfterMissedRep: true,
  },

  prs: {
    formula: "epley" as E1rmFormula,
    /** Sets above this rep count never set an e1RM PR (estimates degrade at high reps). */
    maxRepsForE1rm: 10,
    trackWeight: true,
    trackRepsAtWeight: true,
    trackE1rm: true,
    trackSessionVolume: true,
  },

  restTimer: {
    enabled: true,
    autoStart: true,
    defaultSeconds: 120,
    /** Per-category overrides (seconds). */
    byCategory: { upper: 120, lower: 180, core: 60, cardio: 0, other: 90 } as Record<Category, number>,
    adjustStepSeconds: 15,
    vibrate: true,
    beep: true,
  },

  split: {
    defaultMode: "rotation" as SplitMode,
    /** Weekday convention for weekly mode: 0 = Sunday ... 6 = Saturday. */
    weekStartsOn: 1,
  },

  progress: {
    /** Window (days) whose best e1RM is "current" in the percentage-gain formula. */
    currentWindowDays: 14,
    /** Baselines offered in the % gain panel. "first" = first ever log. */
    baselines: [
      { id: "first", label: "First log", daysAgo: null as number | null },
      { id: "4w", label: "4 weeks ago", daysAgo: 28 as number | null },
      { id: "12w", label: "12 weeks ago", daysAgo: 84 as number | null },
    ],
    chartRanges: [
      { id: "4w", label: "4W", days: 28 as number | null },
      { id: "12w", label: "12W", days: 84 as number | null },
      { id: "1y", label: "1Y", days: 365 as number | null },
      { id: "all", label: "All", days: null as number | null },
    ],
    defaultRange: "12w",
  },

  plates: {
    bar: { lb: 45, kg: 20 } as Record<Unit, number>,
    available: {
      lb: [45, 35, 25, 10, 5, 2.5],
      kg: [25, 20, 15, 10, 5, 2.5, 1.25],
    } as Record<Unit, number[]>,
  },

  friends: {
    enabled: true,
    /** Re-fetch friends' status this often while the Friends page is open (ms). 0 = never. */
    pollMs: 60_000,
    /**
     * Fake friends shown by the LOCAL backend so the Friends page can be
     * debugged without accounts. Edit freely in Settings → Config.
     */
    demoFriends: [
      { name: "Alex", kind: "day", dayName: "Pull", setsToday: 9 },
      { name: "Sam", kind: "day", dayName: "Legs", setsToday: 0 },
      { name: "Jordan", kind: "rest", dayName: null, setsToday: 0 },
    ] as { name: string; kind: "day" | "rest" | "no-split" | "hidden"; dayName: string | null; setsToday: number }[],
  },

  theme: {
    /** Key of THEME_PRESETS in src/config/themes.ts. */
    preset: "midnight",
    /** Per-variable overrides, e.g. { "accent": "#ff00aa", "radius": "8px" }. */
    vars: {} as Record<string, string>,
    /** Layout style: "auto" follows the preset; "playful" or "pro" forces one. */
    style: "auto" as "auto" | "playful" | "pro",
  },

  /**
   * Home dashboard widgets, rendered in this order on the Today screen.
   * color: "surface" | "hero" | "lime" | any CSS color. size: 1 = half width, 2 = full.
   */
  dashboard: {
    enabled: true,
    widgets: [
      { id: "today", enabled: true, size: 2, color: "hero" },
      { id: "week", enabled: true, size: 1, color: "lime" },
      { id: "streak", enabled: true, size: 1, color: "surface" },
      { id: "lastPr", enabled: true, size: 1, color: "surface" },
      { id: "friends", enabled: true, size: 1, color: "surface" },
      { id: "topLift", enabled: false, size: 1, color: "surface" },
      { id: "volume", enabled: false, size: 1, color: "surface" },
    ] as WidgetConfig[],
    /** Target sessions per week for the "week" widget. */
    weeklyTarget: 3,
  },

  reminders: {
    /** A reminder is sent at most this long after its time (covers missed cron ticks, never hours late). */
    windowMinutes: 120,
    snoozeMinutes: 60,
    /** Don't remind if a workout was already started today. */
    skipIfTrainedToday: true,
    /** Send on weekly-split rest days too. */
    onRestDays: false,
  },

  bot: {
    /** In servers, replies with personal data are visible only to the person who ran the command. */
    ephemeralInGuilds: true,
    /** After /log, show a live "Rest over in 2 minutes" countdown (uses restTimer seconds). */
    restCountdownAfterLog: true,
    /** Upper bound for /rest. */
    maxRestSeconds: 1800,
  },

  features: {
    /** Toggle whole features on/off for debugging. */
    restTimer: true,
    shorthandBox: true,
    plateCalculator: true,
    progressionHints: true,
    undoToast: true,
  },

  debug: {
    /** Show the floating debug panel (state, config, log). Also enabled by ?debug=1. */
    panel: false,
    /** console.debug every store call. */
    logStore: false,
    /**
     * Pretend "now" is this ISO time (e.g. "2026-10-26T09:00:00"). Useful for
     * testing weekly splits, ranges and % gain without waiting. null = real clock.
     */
    fakeNow: null as string | null,
  },
};

export type AppConfig = typeof defaultConfig;
