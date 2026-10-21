import type { AppConfig, Unit } from "@/config/app.config";
import { prsForSet, replayPRs } from "./domain/prs";
import type { Exercise, PREvent, PRType, SetEntry, Split } from "./domain/types";
import { toKg } from "./domain/units";
import type { Store } from "./store";
import type { NewSet } from "./store/types";

/** Recompute every PR for one exercise from its sets, persist, and return the events. */
export async function rebuildPRs(store: Store, cfg: AppConfig, exerciseId: string): Promise<PREvent[]> {
  const [sets, sessions] = await Promise.all([store.listSets({ exerciseId }), store.listSessions()]);
  const events = replayPRs(sets, sessions, cfg);
  await store.savePersonalRecords(exerciseId, events);
  return events;
}

/** Save a set and report which PRs it set (detected on save). */
export async function logSet(store: Store, cfg: AppConfig, s: NewSet): Promise<{ set: SetEntry; prs: PRType[] }> {
  const set = await store.addSet(s);
  const events = await rebuildPRs(store, cfg, s.exerciseId);
  return { set, prs: prsForSet(events, set.id) };
}

/** Working + warm-up sets from the most recent session (other than `excludeSessionId`) that has this exercise. */
export function lastSessionSets(allSetsForExercise: SetEntry[], excludeSessionId: string | null): SetEntry[] {
  const prior = allSetsForExercise.filter((s) => s.sessionId !== excludeSessionId);
  if (!prior.length) return [];
  const lastId = prior[prior.length - 1].sessionId;
  return prior.filter((s) => s.sessionId === lastId);
}

/** Stepper increment for an exercise, in kg. */
export function stepKg(ex: Exercise | undefined, unit: Unit, cfg: AppConfig): number {
  return ex?.incrementKg ?? toKg(cfg.logging.weightStep[unit], unit);
}

/**
 * Debug helper: fill the active split with `weeks` of plausible history ending
 * yesterday, so charts, PRs and % gain have something to show.
 */
export async function generateDemoHistory(store: Store, cfg: AppConfig, now: Date, weeks = 12): Promise<number> {
  const split: Split | undefined = (await store.listSplits()).find((s) => s.isActive);
  if (!split || !split.days.length) throw new Error("Create an active split first.");
  const exercises = new Map((await store.listExercises()).map((e) => [e.id, e]));
  const days = [...split.days].sort((a, b) => a.position - b.position);
  const base: Record<string, number> = { upper: 60, lower: 90, core: 0, cardio: 0, other: 40 };
  const sessionsTotal = weeks * 3;
  let made = 0;

  for (let i = 0; i < sessionsTotal; i++) {
    const daysAgo = Math.round(((sessionsTotal - i) * 7) / 3);
    const at = new Date(now.getTime() - daysAgo * 86_400_000);
    at.setHours(18, 0, 0, 0);
    const day = days[i % days.length];
    const sess = await store.startSession(day.id, at);
    for (const plan of day.exercises) {
      const ex = exercises.get(plan.exerciseId);
      const progress = 1 + (i / sessionsTotal) * 0.15 + (Math.random() - 0.5) * 0.03;
      const w = Math.round(((base[ex?.category ?? "other"] ?? 40) * progress) / 2.5) * 2.5;
      for (let k = 0; k < plan.targetSets; k++) {
        const createdAt = new Date(at.getTime() + (plan.order * 10 + k * 3) * 60_000).toISOString();
        await store.addSet({ sessionId: sess.id, exerciseId: plan.exerciseId, setIndex: k, weightKg: w, reps: 5 + Math.floor(Math.random() * 4), rpe: null, isWarmup: false, note: null, createdAt });
      }
    }
    await store.finishSession(sess.id, new Date(at.getTime() + 3_600_000));
    made++;
  }
  for (const id of new Set(days.flatMap((d) => d.exercises.map((x) => x.exerciseId)))) await rebuildPRs(store, cfg, id);
  return made;
}
