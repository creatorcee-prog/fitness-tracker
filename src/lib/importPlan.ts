import type { Exercise, Session, SetEntry, Split } from "./domain/types";

/** The parts of an export (local or Supabase) that an import uses. */
export interface ExportData {
  exercises?: Exercise[];
  splits?: Split[];
  sessions?: Session[];
  sets?: SetEntry[];
}

export interface ImportPlan {
  newExercises: Exercise[];
  splits: Split[];
  sessions: Session[];
  sets: SetEntry[];
  skippedSessions: number;
}

/**
 * Maps an export onto an account: exercises are matched by name (created if
 * missing), everything gets fresh ids, sessions already present (same start
 * time) are skipped so importing twice is harmless, and unfinished sessions
 * are closed so they don't become your "workout in progress".
 */
export function planImport(
  data: ExportData,
  existing: { exercises: Exercise[]; sessionStarts: Set<string>; hasActiveSplit: boolean },
  newId: () => string,
): ImportPlan {
  const byName = new Map(existing.exercises.map((e) => [e.name.trim().toLowerCase(), e.id]));
  const srcEx = new Map((data.exercises ?? []).map((e) => [e.id, e]));
  const exMap = new Map<string, string>();
  const newExercises: Exercise[] = [];

  const mapExercise = (oldId: string): string | null => {
    if (exMap.has(oldId)) return exMap.get(oldId)!;
    const src = srcEx.get(oldId);
    if (!src) return null;
    const key = src.name.trim().toLowerCase();
    let id = byName.get(key);
    if (!id) {
      id = newId();
      newExercises.push({ ...src, id, ownerId: null });
      byName.set(key, id);
    }
    exMap.set(oldId, id);
    return id;
  };

  const dayMap = new Map<string, string>();
  let activeTaken = existing.hasActiveSplit;
  const splits = (data.splits ?? []).map((sp) => {
    const id = newId();
    const isActive = sp.isActive && !activeTaken;
    if (isActive) activeTaken = true;
    return {
      ...sp,
      id,
      isActive,
      days: sp.days.map((d) => {
        const dayId = newId();
        dayMap.set(d.id, dayId);
        return {
          ...d,
          id: dayId,
          splitId: id,
          exercises: d.exercises.flatMap((x) => {
            const exerciseId = mapExercise(x.exerciseId);
            return exerciseId ? [{ ...x, exerciseId }] : [];
          }),
        };
      }),
    };
  });

  const setsBySession = new Map<string, SetEntry[]>();
  for (const s of data.sets ?? []) setsBySession.set(s.sessionId, [...(setsBySession.get(s.sessionId) ?? []), s]);

  const sessions: Session[] = [];
  const sets: SetEntry[] = [];
  let skippedSessions = 0;
  for (const se of data.sessions ?? []) {
    if (existing.sessionStarts.has(new Date(se.startedAt).toISOString())) {
      skippedSessions++;
      continue;
    }
    const id = newId();
    const own = setsBySession.get(se.id) ?? [];
    const lastAt = own.map((s) => s.createdAt).sort().pop();
    sessions.push({ ...se, id, splitDayId: se.splitDayId ? dayMap.get(se.splitDayId) ?? null : null, finishedAt: se.finishedAt ?? lastAt ?? se.startedAt });
    for (const s of own) {
      const exerciseId = mapExercise(s.exerciseId);
      if (exerciseId) sets.push({ ...s, id: newId(), sessionId: id, exerciseId });
    }
  }
  return { newExercises, splits, sessions, sets, skippedSessions };
}
