import type { AppConfig, Unit } from "@/config/app.config";
import type { BodyweightEntry } from "@/lib/domain/bodyweight";
import { e1rm } from "@/lib/domain/e1rm";
import { replayPRs } from "@/lib/domain/prs";
import type { Today } from "@/lib/domain/split";
import { finishedBetween, freezeRules, streakInfo, weekStart } from "@/lib/domain/stats";
import type { Exercise, Session, SetEntry } from "@/lib/domain/types";
import { fromKg } from "@/lib/domain/units";
import type { WidgetData } from "./sandbox";

/** The read-only snapshot custom widgets get (see sandbox.ts). Weights in the user's unit. */
export function buildWidgetData(input: {
  cfg: AppConfig; unit: Unit; now: Date; today: Today | null; sessions: Session[]; sets: SetEntry[]; exercises: Map<string, Exercise>; bodyweight: BodyweightEntry[];
  /** Split day id → name, so recent workouts say "Push" rather than nothing. */
  dayNames?: Map<string, string>;
}): WidgetData {
  const { cfg, unit, now, today, sessions, sets, exercises, bodyweight, dayNames = new Map() } = input;
  const w = (kg: number) => Number(fromKg(kg, unit).toFixed(1));
  const name = (id: string) => exercises.get(id)?.name ?? "?";
  const target = cfg.dashboard.weeklyTarget;
  const st = streakInfo(sessions, now, cfg.split.weekStartsOn, target, freezeRules(cfg));
  const working = sets.filter((s) => !s.isWarmup);

  const recent = sessions
    .filter((s) => s.finishedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 10)
    .map((s) => {
      const own = working.filter((x) => x.sessionId === s.id);
      const ids = [...new Set(own.map((x) => x.exerciseId))];
      const dayName = s.splitDayId ? dayNames.get(s.splitDayId) ?? null : null;
      return { date: s.startedAt.slice(0, 10), dayName, lifts: ids.map((id) => ({ name: name(id), sets: own.filter((x) => x.exerciseId === id).map((x) => ({ weight: w(x.weightKg), reps: x.reps })) })) };
    });

  const best = new Map<string, number>();
  for (const s of working) {
    if (s.reps < 1 || s.reps > cfg.prs.maxRepsForE1rm) continue;
    const v = e1rm(s.weightKg, s.reps, cfg.prs.formula);
    if (v > (best.get(s.exerciseId) ?? 0)) best.set(s.exerciseId, v);
  }

  const byEx = new Map<string, SetEntry[]>();
  for (const s of sets) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
  const prs = [...byEx.values()]
    .flatMap((xs) => replayPRs(xs, sessions, cfg))
    .filter((e) => !e.baseline)
    .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))
    .slice(0, 10)
    .map((e) => ({ date: e.achievedAt.slice(0, 10), lift: name(e.exerciseId), type: e.type, weight: w(e.weightKg), reps: e.reps }));

  return {
    unit,
    today: today?.kind === "day"
      ? { kind: "day", dayName: today.day.name, exercises: [...today.day.exercises].sort((a, b) => a.order - b.order).map((x) => ({ name: name(x.exerciseId), sets: x.targetSets, reps: x.repRange })) }
      : { kind: today?.kind === "rest" ? "rest" : "no-split", dayName: null, exercises: [] },
    week: { done: finishedBetween(sessions, weekStart(now, cfg.split.weekStartsOn), new Date(now.getTime() + 1)).length, target },
    streak: { weeks: st.weeks, freezes: st.freezes },
    recent,
    lifts: [...best.entries()].map(([id, kg]) => ({ name: name(id), e1rm: w(kg) })).sort((a, b) => b.e1rm - a.e1rm),
    prs,
    bodyweight: [...bodyweight].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((b) => ({ date: b.date, weight: w(b.weightKg) })),
  };
}
