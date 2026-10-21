import type { AppConfig, Unit } from "@/config/app.config";
import type { Goal } from "@/lib/domain/goals";
import { matchExercise } from "@/lib/domain/match";
import type { Exercise, Profile, Split } from "@/lib/domain/types";
import { toKg } from "@/lib/domain/units";
import type { Store } from "@/lib/store/types";

/**
 * Changes James may PROPOSE in the in-app chat. The model never writes
 * anything: it can only suggest one of these, the server and the browser both
 * validate it, the user sees a plain description we generate (not the model's
 * wording) and taps Apply. Apply runs in the browser with the user's own
 * session, so database rules (RLS) apply as for any other edit.
 *
 * Lifts and split days are referred to by NAME and matched here, so the model
 * never handles ids.
 */
export type AccountAction =
  | { type: "add_goal"; goal: "lift_e1rm" | "lift_reps" | "sessions_per_week"; lift?: string; target: number; weight?: number; deadline?: string }
  | { type: "set_plan"; day: string; lift: string; sets?: number; reps?: string }
  | { type: "add_exercise"; day: string; lift: string; sets: number; reps: string }
  | { type: "remove_exercise"; day: string; lift: string }
  | { type: "set_calorie_target"; calories: number; protein?: number }
  | { type: "set_unit"; unit: Unit }
  | { type: "set_weekly_target"; sessions: number }
  | { type: "set_display_name"; name: string }
  | { type: "set_guided"; on: boolean };

export const MAX_ACTIONS = 3;

/** The list the model is shown (kept short: it costs tokens on every in-app question). */
export const ACTIONS_PROMPT = `CHANGING THINGS: you can't change anything yourself, but in this app chat you can PROPOSE changes; the user taps Apply to confirm.
Only propose when the user asks for a change or clearly agrees to one. At most ${MAX_ACTIONS}. Use lift and split day names exactly as in TRAINING DATA. Weights are in the user's unit.
To propose, end your reply with one line: <actions>[...]</actions> containing a JSON array of:
{"type":"add_goal","goal":"lift_e1rm","lift":"Bench Press","target":225,"deadline":"2027-03-01"}  (deadline optional)
{"type":"add_goal","goal":"lift_reps","lift":"Pull-up","weight":0,"target":12}
{"type":"add_goal","goal":"sessions_per_week","target":4}
{"type":"set_plan","day":"Push","lift":"Bench Press","sets":4,"reps":"6-8"}
{"type":"add_exercise","day":"Pull","lift":"Face Pull","sets":3,"reps":"12-15"}
{"type":"remove_exercise","day":"Legs","lift":"Leg Extension"}
{"type":"set_calorie_target","calories":2800,"protein":180}  (protein optional)
{"type":"set_unit","unit":"kg"}
{"type":"set_weekly_target","sessions":4}
{"type":"set_display_name","name":"Big Mike"}
{"type":"set_guided","on":true}  (guided sets: suggested weight jumps)
Say in your reply what you're proposing. Never claim it's done: the user still has to tap Apply.`;

const REPS = /^\d{1,2}(\s*-\s*\d{1,2})?$/;
const str = (v: unknown, max = 60) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null);
const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);

/** Returns a clean action, or null if anything is off. Unknown fields are dropped. */
export function validateAction(raw: unknown): AccountAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  switch (a.type) {
    case "add_goal": {
      const goal = a.goal;
      const deadline = a.deadline === undefined ? undefined : typeof a.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.deadline) ? a.deadline : null;
      if (deadline === null) return null;
      if (goal === "sessions_per_week") {
        const target = int(a.target, 1, 7);
        return target ? { type: "add_goal", goal, target } : null;
      }
      const lift = str(a.lift);
      if (!lift) return null;
      if (goal === "lift_e1rm") {
        const target = num(a.target, 1, 2000);
        return target ? { type: "add_goal", goal, lift, target, ...(deadline ? { deadline } : {}) } : null;
      }
      if (goal === "lift_reps") {
        const target = int(a.target, 1, 100);
        const weight = num(a.weight ?? 0, 0, 2000);
        return target && weight !== null ? { type: "add_goal", goal, lift, target, weight, ...(deadline ? { deadline } : {}) } : null;
      }
      return null;
    }
    case "set_plan": {
      const day = str(a.day), lift = str(a.lift);
      const sets = a.sets === undefined ? undefined : int(a.sets, 1, 10);
      const reps = a.reps === undefined ? undefined : typeof a.reps === "string" && REPS.test(a.reps.trim()) ? a.reps.replace(/\s/g, "") : null;
      if (!day || !lift || sets === null || reps === null || (sets === undefined && reps === undefined)) return null;
      return { type: "set_plan", day, lift, ...(sets !== undefined ? { sets } : {}), ...(reps !== undefined ? { reps } : {}) };
    }
    case "add_exercise": {
      const day = str(a.day), lift = str(a.lift), sets = int(a.sets, 1, 10);
      const reps = typeof a.reps === "string" && REPS.test(a.reps.trim()) ? a.reps.replace(/\s/g, "") : null;
      return day && lift && sets && reps ? { type: "add_exercise", day, lift, sets, reps } : null;
    }
    case "remove_exercise": {
      const day = str(a.day), lift = str(a.lift);
      return day && lift ? { type: "remove_exercise", day, lift } : null;
    }
    case "set_calorie_target": {
      const calories = int(a.calories, 800, 8000);
      const protein = a.protein === undefined ? undefined : int(a.protein, 20, 500);
      if (!calories || protein === null) return null;
      return { type: "set_calorie_target", calories, ...(protein ? { protein } : {}) };
    }
    case "set_unit":
      return a.unit === "lb" || a.unit === "kg" ? { type: "set_unit", unit: a.unit } : null;
    case "set_weekly_target": {
      const sessions = int(a.sessions, 1, 7);
      return sessions ? { type: "set_weekly_target", sessions } : null;
    }
    case "set_display_name": {
      const name = str(a.name, 40);
      return name ? { type: "set_display_name", name } : null;
    }
    case "set_guided":
      return typeof a.on === "boolean" ? { type: "set_guided", on: a.on } : null;
    default:
      return null;
  }
}

/**
 * Pulls the <actions>[...]</actions> block off the end of a reply.
 * Returns the reply without it plus the valid actions (invalid ones are dropped silently).
 */
export function extractActions(text: string): { text: string; actions: AccountAction[] } {
  const m = text.match(/<actions>([\s\S]*?)<\/actions>/i);
  if (!m) return { text, actions: [] };
  const rest = (text.slice(0, m.index) + text.slice(m.index! + m[0].length)).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1].trim());
  } catch {
    return { text: rest, actions: [] };
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return { text: rest, actions: list.map(validateAction).filter((x): x is AccountAction => x !== null).slice(0, MAX_ACTIONS) };
}

const fmtW = (w: number, unit: Unit) => `${Number(w.toFixed(1))} ${unit}`;

/** The text on the Apply card. Generated here from the validated fields, never taken from the model. */
export function describeAction(a: AccountAction, unit: Unit): string {
  switch (a.type) {
    case "add_goal":
      return a.goal === "sessions_per_week" ? `Add goal: ${a.target} sessions a week`
        : a.goal === "lift_e1rm" ? `Add goal: ${a.lift} est. 1RM ${fmtW(a.target, unit)}${a.deadline ? ` by ${a.deadline}` : ""}`
        : `Add goal: ${a.lift} ${a.target} reps at ${a.weight ? fmtW(a.weight, unit) : "bodyweight"}${a.deadline ? ` by ${a.deadline}` : ""}`;
    case "set_plan":
      return `${a.day}: ${a.lift} → ${[a.sets && `${a.sets} sets`, a.reps && `${a.reps} reps`].filter(Boolean).join(" × ")}`;
    case "add_exercise":
      return `${a.day}: add ${a.lift}, ${a.sets} × ${a.reps}`;
    case "remove_exercise":
      return `${a.day}: remove ${a.lift}`;
    case "set_calorie_target":
      return `Calorie target: ${a.calories} kcal${a.protein ? `, protein ${a.protein} g` : ""}`;
    case "set_unit":
      return `Units: ${a.unit}`;
    case "set_weekly_target":
      return `Weekly target: ${a.sessions} sessions`;
    case "set_display_name":
      return `Display name: ${a.name}`;
    case "set_guided":
      return `Guided sets: ${a.on ? "on" : "off"}`;
  }
}

export interface ApplyDeps {
  store: Store;
  cfg: AppConfig;
  profile: Profile;
  now: () => Date;
  /** Change config overrides (weekly target, guided sets). */
  patchConfig: (p: Record<string, unknown>) => void;
  newId: () => string;
}

/** Applies one action. Returns an undo, or throws a friendly error (unknown lift/day…). */
export async function applyAction(a: AccountAction, d: ApplyDeps): Promise<() => Promise<void>> {
  const { store, cfg, profile } = d;
  const unit = profile.unit;
  const findLift = async (name: string): Promise<Exercise> => {
    const ex = matchExercise(name, await store.listExercises(), cfg.logging.aliases);
    if (!ex) throw new Error(`I couldn't find a lift called “${name}”. Add it on the Split page first.`);
    return ex;
  };
  const activeSplit = async (): Promise<Split> => {
    const sp = (await store.listSplits()).find((s) => s.isActive);
    if (!sp) throw new Error("You don't have an active split yet.");
    return sp;
  };
  const editDay = async (dayName: string, fn: (exs: Split["days"][number]["exercises"], ex: Exercise) => Split["days"][number]["exercises"], lift: string) => {
    const sp = await activeSplit();
    const day = matchExercise(dayName, sp.days);
    if (!day) throw new Error(`Your split has no day called “${dayName}”.`);
    const ex = await findLift(lift);
    const before: Split = structuredClone(sp);
    const days = sp.days.map((x) => (x.id === day.id ? { ...x, exercises: fn([...x.exercises], ex).map((e, i) => ({ ...e, order: i })) } : x));
    await store.saveSplit({ ...sp, days });
    return async () => void (await store.saveSplit(before));
  };

  switch (a.type) {
    case "add_goal": {
      const ex = a.goal === "sessions_per_week" ? null : await findLift(a.lift!);
      const g: Goal = {
        id: d.newId(), type: a.goal, exerciseId: ex?.id ?? null,
        targetValue: a.goal === "lift_e1rm" ? toKg(a.target, unit) : a.target,
        targetWeightKg: a.goal === "lift_reps" ? toKg(a.weight ?? 0, unit) : null,
        deadline: a.deadline ?? null, achievedAt: null, createdAt: d.now().toISOString(),
      };
      await store.saveGoal(g);
      return async () => store.deleteGoal(g.id);
    }
    case "set_plan":
      return editDay(a.day, (exs, ex) => {
        const i = exs.findIndex((x) => x.exerciseId === ex.id);
        if (i < 0) throw new Error(`${ex.name} isn't on ${a.day}. Ask me to add it instead.`);
        exs[i] = { ...exs[i], ...(a.sets ? { targetSets: a.sets } : {}), ...(a.reps ? { repRange: a.reps } : {}) };
        return exs;
      }, a.lift);
    case "add_exercise":
      return editDay(a.day, (exs, ex) => {
        if (exs.some((x) => x.exerciseId === ex.id)) throw new Error(`${ex.name} is already on ${a.day}.`);
        return [...exs, { exerciseId: ex.id, order: exs.length, targetSets: a.sets, repRange: a.reps }];
      }, a.lift);
    case "remove_exercise":
      return editDay(a.day, (exs, ex) => {
        if (!exs.some((x) => x.exerciseId === ex.id)) throw new Error(`${ex.name} isn't on ${a.day}.`);
        return exs.filter((x) => x.exerciseId !== ex.id);
      }, a.lift);
    case "set_calorie_target": {
      const prev = await store.getNutritionTargets();
      await store.setNutritionTargets({ calories: a.calories, protein: a.protein ?? prev.protein });
      return async () => store.setNutritionTargets(prev);
    }
    case "set_unit": {
      const prev = profile.unit;
      await store.updateProfile({ unit: a.unit });
      return async () => void (await store.updateProfile({ unit: prev }));
    }
    case "set_display_name": {
      const prev = profile.displayName;
      await store.updateProfile({ displayName: a.name });
      return async () => void (await store.updateProfile({ displayName: prev }));
    }
    case "set_weekly_target": {
      const prev = cfg.dashboard.weeklyTarget;
      d.patchConfig({ dashboard: { weeklyTarget: a.sessions } });
      return async () => d.patchConfig({ dashboard: { weeklyTarget: prev } });
    }
    case "set_guided": {
      const prev = cfg.logging.guided;
      d.patchConfig({ logging: { guided: a.on } });
      return async () => d.patchConfig({ logging: { guided: prev } });
    }
  }
}
