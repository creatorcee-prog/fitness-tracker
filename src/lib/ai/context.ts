import type { AppConfig } from "@/config/app.config";
import { e1rm } from "@/lib/domain/e1rm";
import { replayPRs } from "@/lib/domain/prs";
import { localDate } from "@/lib/domain/split";
import { finishedBetween, weekStart, weeklyStreak } from "@/lib/domain/stats";
import type { SetEntry } from "@/lib/domain/types";
import { fromKg } from "@/lib/domain/units";
import type { BotData, BotUser } from "@/lib/bot/data";

/** Rough token estimate (≈4 characters per token for English + numbers). */
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Compact, server-built training summary for /ask. Only facts from the
 * database; the model is told to use nothing else. Shrinks itself to stay
 * under `maxTokens`.
 */
export async function buildTrainingContext(data: BotData, user: BotUser, cfg: AppConfig, now: Date, maxTokens = 2000): Promise<string> {
  const [today, split, exercises, sessions, sets, goals, bodyweight] = await Promise.all([
    data.getToday(user.id, now),
    data.getActiveSplit(user.id),
    data.listExercises(user.id),
    data.listSessions(user.id),
    data.listSets(user.id),
    data.listGoals(user.id),
    data.listBodyweight(user.id),
  ]);
  const unit = user.unit;
  const w = (kg: number) => `${Number(fromKg(kg, unit).toFixed(1))}`;
  const name = new Map(exercises.map((e) => [e.id, e.name]));
  const dayName = new Map((split?.days ?? []).map((d) => [d.id, d.name]));
  const date = (iso: string) => localDate(new Date(iso), user.timezone);

  const lines: string[] = [];
  const nowLocal = localDate(now, user.timezone);
  // No name or Discord ID: the provider doesn't need to know who this is.
  lines.push(`Units: ${unit}. Today: ${nowLocal} (${DOW[new Date(nowLocal + "T12:00:00").getDay()]}).`);

  // Today's split day
  if (today.kind === "day") {
    const plan = [...today.day.exercises].sort((a, b) => a.order - b.order).map((x) => `${name.get(x.exerciseId) ?? "?"} ${x.targetSets}x${x.repRange}`);
    lines.push(`Today's split day: ${today.day.name} (${split?.mode ?? "rotation"} split "${split?.name ?? ""}"): ${plan.join(", ") || "no exercises planned"}.`);
  } else if (today.kind === "rest") {
    lines.push("Today: rest day on a weekly split.");
  } else {
    lines.push("No split set up.");
  }
  const open = sessions.find((s) => !s.finishedAt);
  if (open) lines.push(`Workout in progress: ${dayName.get(open.splitDayId ?? "") ?? "freestyle"}, ${sets.filter((s) => s.sessionId === open.id && !s.isWarmup).length} working sets so far.`);

  // Consistency
  const target = cfg.dashboard.weeklyTarget;
  const thisWeek = finishedBetween(sessions, weekStart(now, cfg.split.weekStartsOn), new Date(now.getTime() + 1)).length;
  lines.push(`Sessions this week: ${thisWeek}/${target} target. Weekly streak: ${weeklyStreak(sessions, now, cfg.split.weekStartsOn, target)} weeks. Total sessions logged: ${sessions.filter((s) => s.finishedAt).length}.`);

  // Recent sessions: top set per lift
  const bySession = new Map<string, SetEntry[]>();
  for (const s of sets) if (!s.isWarmup) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]);
  const recent = [...sessions].filter((s) => bySession.has(s.id)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const sessionLines = recent.map((s) => {
    const perLift = new Map<string, SetEntry>();
    for (const x of bySession.get(s.id)!) {
      const cur = perLift.get(x.exerciseId);
      if (!cur || e1rm(x.weightKg, x.reps) > e1rm(cur.weightKg, cur.reps)) perLift.set(x.exerciseId, x);
    }
    const tops = [...perLift.values()].map((x) => `${name.get(x.exerciseId) ?? "?"} ${w(x.weightKg)}x${x.reps} (${bySession.get(s.id)!.filter((y) => y.exerciseId === x.exerciseId).length} sets)`);
    return `- ${date(s.startedAt)} ${dayName.get(s.splitDayId ?? "") ?? "Workout"}${s.finishedAt ? "" : " (in progress)"}: ${tops.join("; ")}`;
  });

  // Recent PRs (non-baseline), newest first
  const byExercise = new Map<string, SetEntry[]>();
  for (const s of sets) byExercise.set(s.exerciseId, [...(byExercise.get(s.exerciseId) ?? []), s]);
  const prs = [...byExercise.values()]
    .flatMap((xs) => replayPRs(xs, sessions, cfg))
    .filter((e) => !e.baseline && (e.type === "e1rm" || e.type === "weight"))
    .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
  const seen = new Set<string>();
  const prLines: string[] = [];
  for (const e of prs) {
    const k = `${e.setId}:${e.type}`;
    if (seen.has(k) || prLines.length >= 5) continue;
    seen.add(k);
    prLines.push(`- ${date(e.achievedAt)} ${name.get(e.exerciseId) ?? "?"} ${e.type === "e1rm" ? `est. 1RM ${w(e.value)}` : "heaviest"} (${w(e.weightKg)}x${e.reps})`);
  }

  // Goals and bodyweight
  const goalLines = goals.map((g) => {
    const lift = g.exerciseId ? name.get(g.exerciseId) ?? "a lift" : "";
    const v = g.type.startsWith("lift") || g.type === "bodyweight" ? `${w(g.targetValue)} ${unit}` : `${g.targetValue}`;
    return `- ${g.type.replace("_", " ")}${lift ? ` ${lift}` : ""}: ${v}${g.deadline ? ` by ${g.deadline}` : ""}`;
  });
  let bwLine = "Bodyweight: not logged.";
  if (bodyweight.length) {
    const last = bodyweight[bodyweight.length - 1];
    const monthAgo = new Date(Date.parse(last.date) - 28 * 86_400_000).toISOString().slice(0, 10);
    const base = [...bodyweight].reverse().find((b) => b.date <= monthAgo);
    bwLine = `Bodyweight: ${w(last.weightKg)} ${unit} on ${last.date}${base ? `, ${Number((fromKg(last.weightKg - base.weightKg, unit)).toFixed(1))} ${unit} vs 4 weeks earlier` : ""}.`;
  }

  // Assemble, dropping older sessions until it fits.
  for (let n = Math.min(5, sessionLines.length); n >= 0; n--) {
    const out = [
      ...lines,
      sessionLines.length ? `Last ${n} sessions (top set per lift, weight x reps):` : "No sessions logged yet.",
      ...sessionLines.slice(0, n),
      prLines.length ? "Recent PRs:" : "No PRs yet.",
      ...prLines,
      goalLines.length ? "Goals:" : "Goals: none set.",
      ...goalLines,
      bwLine,
    ].join("\n");
    if (estimateTokens(out) <= maxTokens || n === 0) return out;
  }
  return lines.join("\n");
}
