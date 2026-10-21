import type { AppConfig } from "@/config/app.config";
import { e1rm } from "./e1rm";
import type { PREvent, PRType, Session, SetEntry } from "./types";

const EPS = 1e-6;

export function countsForPRs(set: SetEntry, cfg: AppConfig): boolean {
  return set.reps > 0 && (!set.isWarmup || cfg.logging.warmupsCountForPRs);
}

/**
 * Replays every set of ONE exercise in order and returns every PR event.
 * Because records are derived by replay, editing or deleting a set "rebuilds"
 * them for free. The last event of each type is the current record.
 */
export function replayPRs(sets: SetEntry[], sessions: Session[], cfg: AppConfig): PREvent[] {
  const working = sets.filter((s) => countsForPRs(s, cfg)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.setIndex - b.setIndex);
  const events: PREvent[] = [];
  const seen: SetEntry[] = [];
  let bestWeight = -Infinity;
  let bestE1rm = -Infinity;

  for (const s of working) {
    const baseline = seen.length === 0;
    const base = { exerciseId: s.exerciseId, setId: s.id, sessionId: s.sessionId, achievedAt: s.createdAt, weightKg: s.weightKg, reps: s.reps, baseline };

    if (cfg.prs.trackWeight && s.weightKg > bestWeight + EPS) {
      events.push({ ...base, type: "weight", value: s.weightKg });
    }
    if (cfg.prs.trackRepsAtWeight) {
      const bestRepsAtOrAbove = Math.max(-Infinity, ...seen.filter((p) => p.weightKg >= s.weightKg - EPS).map((p) => p.reps));
      if (s.reps > bestRepsAtOrAbove) events.push({ ...base, type: "reps_at_weight", value: s.reps });
    }
    if (cfg.prs.trackE1rm && s.reps <= cfg.prs.maxRepsForE1rm) {
      const est = e1rm(s.weightKg, s.reps, cfg.prs.formula);
      if (est > bestE1rm + EPS) {
        events.push({ ...base, type: "e1rm", value: est });
        bestE1rm = est;
      }
    }
    bestWeight = Math.max(bestWeight, s.weightKg);
    seen.push(s);
  }

  if (cfg.prs.trackSessionVolume) {
    const finished = new Map(sessions.filter((x) => x.finishedAt).map((x) => [x.id, x]));
    const vol = new Map<string, number>();
    for (const s of working) if (finished.has(s.sessionId)) vol.set(s.sessionId, (vol.get(s.sessionId) ?? 0) + s.weightKg * s.reps);
    const ordered = [...vol.entries()].sort((a, b) => finished.get(a[0])!.finishedAt!.localeCompare(finished.get(b[0])!.finishedAt!));
    let best = -Infinity;
    ordered.forEach(([sessionId, v], i) => {
      if (v > best + EPS) {
        const sess = finished.get(sessionId)!;
        events.push({ exerciseId: working[0].exerciseId, type: "session_volume", value: v, setId: null, sessionId, achievedAt: sess.finishedAt!, weightKg: 0, reps: 0, baseline: i === 0 });
        best = v;
      }
    });
  }
  return events;
}

/** Current record per type (the latest event of each type). */
export function currentRecords(events: PREvent[]): Partial<Record<PRType, PREvent>> {
  const out: Partial<Record<PRType, PREvent>> = {};
  for (const e of events) out[e.type] = e;
  return out;
}

/** PR types (non-baseline) that a particular set earned. */
export function prsForSet(events: PREvent[], setId: string): PRType[] {
  return events.filter((e) => e.setId === setId && !e.baseline).map((e) => e.type);
}
