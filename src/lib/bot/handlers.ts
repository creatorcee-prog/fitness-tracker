import type { AppConfig, Unit } from "@/config/app.config";
import { percentageGains } from "@/lib/domain/gain";
import { matchExercise } from "@/lib/domain/match";
import { platesPerSide } from "@/lib/domain/plates";
import { prefillFor } from "@/lib/domain/progression";
import { currentRecords, prsForSet, replayPRs } from "@/lib/domain/prs";
import { parseShorthand } from "@/lib/domain/shorthand";
import { nextPosition } from "@/lib/domain/split";
import { finishedBetween, volumeKg, weekStart, weeklyStreak } from "@/lib/domain/stats";
import type { Exercise, PREvent, PRType, SetEntry, Split, SplitDay } from "@/lib/domain/types";
import { formatWeight, fromKg, toKg } from "@/lib/domain/units";
import { lastSessionSets, stepKg } from "@/lib/service";
import type { BotData, BotUser } from "./data";
import { formatDuration, parseDuration } from "./duration";

export interface Button {
  label: string;
  id: string;
  style?: "primary" | "secondary" | "danger";
}

export interface BotReply {
  content: string;
  buttons?: Button[];
}

export interface BotContext {
  data: BotData;
  cfg: AppConfig;
  now: Date;
  discordUserId: string;
  appUrl: string;
}

export type Options = Record<string, string | number | boolean | undefined>;

const PR_LABEL: Record<PRType, string> = { weight: "Heaviest", reps_at_weight: "Rep PR", e1rm: "e1RM PR", session_volume: "Volume PR" };

/** Commands that work without a linked account and need no database. */
export const ACCOUNTLESS = new Set(["plates", "rest"]);

class UserError extends Error {}

const wt = (ctx: BotContext, kg: number, unit: Unit) => formatWeight(kg, unit, ctx.cfg.units.displayDecimals);
const num = (kg: number, unit: Unit) => String(Number(fromKg(kg, unit).toFixed(1)));
const setText = (s: SetEntry, unit: Unit) => `${num(s.weightKg, unit)}×${s.reps}`;

async function requireUser(ctx: BotContext): Promise<BotUser> {
  const u = await ctx.data.findUser(ctx.discordUserId);
  if (!u) throw new UserError(`👋 I don't know you yet. Sign in at ${ctx.appUrl} with this Discord account, then try again.`);
  return u;
}

/** Re-derive PRs for one exercise (same replay as the web app) and persist them. */
async function rebuild(ctx: BotContext, uid: string, exerciseId: string): Promise<PREvent[]> {
  const [sets, sessions] = await Promise.all([ctx.data.listSets(uid, { exerciseId }), ctx.data.listSessions(uid)]);
  const events = replayPRs(sets, sessions, ctx.cfg);
  await ctx.data.savePersonalRecords(uid, exerciseId, events);
  return events;
}

function findDay(split: Split | null, id: string | null | undefined): SplitDay | null {
  return (id && split?.days.find((d) => d.id === id)) || null;
}

function restSecondsFor(ctx: BotContext, ex: Exercise | undefined): number {
  return (ex && ctx.cfg.restTimer.byCategory[ex.category]) ?? ctx.cfg.restTimer.defaultSeconds;
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

// ------------------------------------------------------------------ commands

async function today(ctx: BotContext): Promise<BotReply> {
  const u = await requireUser(ctx);
  const [open, split] = await Promise.all([ctx.data.getOpenSession(u.id), ctx.data.getActiveSplit(u.id)]);
  let day = findDay(split, open?.splitDayId);
  if (!open || !day) {
    const t = await ctx.data.getToday(u.id, ctx.now);
    if (t.kind === "no-split") return { content: `No active split yet. Set one up at ${ctx.appUrl}/split, or just \`/log bench 185x5\`.` };
    if (t.kind === "rest") return { content: "💤 **Rest day** on your weekly split. Want to train anyway? Use `/swap`." };
    day = t.day;
  }
  const [exercises, sets] = await Promise.all([ctx.data.listExercises(u.id), ctx.data.listSets(u.id)]);
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const lines = [...day.exercises].sort((a, b) => a.order - b.order).map((p) => {
    const ex = exById.get(p.exerciseId);
    const hist = sets.filter((s) => s.exerciseId === p.exerciseId);
    const last = lastSessionSets(hist, open?.id ?? null).filter((s) => !s.isWarmup);
    const done = open ? hist.filter((s) => s.sessionId === open.id && !s.isWarmup).length : 0;
    const pf = prefillFor(done, last, p.repRange, ex?.category ?? "other", u.unit, ctx.cfg, stepKg(ex, u.unit, ctx.cfg));
    let line = `• **${ex?.name ?? "Unknown"}** ${p.targetSets}×${p.repRange}`;
    if (open) line += done >= p.targetSets ? " · ✅ done" : ` · ${done}/${p.targetSets}`;
    if (last.length) line += ` · last ${last.map((s) => setText(s, u.unit)).join(", ")}`;
    if (pf?.reason === "progression") line += ` · ↑ try ${wt(ctx, pf.weightKg, u.unit)}`;
    return line;
  });
  const head = open ? `🏋️ **${day.name}**, in progress` : `📅 **Today: ${day.name}**`;
  const body = lines.length ? lines.join("\n") : "_No exercises planned for this day._";
  const buttons: Button[] = !open && split?.mode === "rotation" ? [{ label: `Skip ${day.name}`, id: "skip", style: "secondary" }] : [];
  return { content: `${head}\n${body}\n-# Log with \`/log bench 185x5\``, buttons };
}

/** Shared by /log and the [Same again] button. */
async function logParsed(
  ctx: BotContext,
  u: BotUser,
  ex: Exercise,
  entries: { weightKg: number; reps: number; rpe: number | null }[],
): Promise<BotReply> {
  let session = await ctx.data.getOpenSession(u.id);
  let started: string | null = null;
  const split = await ctx.data.getActiveSplit(u.id);
  if (!session) {
    const t = await ctx.data.getToday(u.id, ctx.now);
    const dayId = t.kind === "day" ? t.day.id : null;
    session = await ctx.data.startSession(u.id, dayId, ctx.now);
    started = t.kind === "day" ? t.day.name : "a freestyle workout";
  }
  const inSession = (await ctx.data.listSets(u.id, { sessionId: session.id })).filter((s) => s.exerciseId === ex.id);
  let idx = inSession.length;
  const created: SetEntry[] = [];
  for (const [i, e] of entries.entries()) {
    created.push(
      await ctx.data.addSet(u.id, {
        sessionId: session.id, exerciseId: ex.id, setIndex: idx++, weightKg: e.weightKg, reps: e.reps, rpe: e.rpe,
        isWarmup: false, note: null, createdAt: new Date(ctx.now.getTime() + i).toISOString(),
      }),
    );
  }
  const events = await rebuild(ctx, u.id, ex.id);
  const prs = new Set(created.flatMap((s) => prsForSet(events, s.id)));
  const working = inSession.filter((s) => !s.isWarmup).length + created.length;
  const target = findDay(split, session.splitDayId)?.exercises.find((x) => x.exerciseId === ex.id)?.targetSets;

  let content = `✅ **${ex.name}** ${created.map((s) => `${num(s.weightKg, u.unit)} × ${s.reps}`).join(", ")} ${u.unit}`;
  if (target) content += ` · set ${working}/${target}`;
  if (prs.size) content += `\n🏆 ${[...prs].map((p) => PR_LABEL[p]).join(", ")}!`;
  if (started) content += `\n-# Started ${started}. Finish with \`/done\`.`;
  const rest = restSecondsFor(ctx, ex);
  if (ctx.cfg.bot.restCountdownAfterLog && ctx.cfg.restTimer.enabled && rest > 0) {
    content += `\n⏱ Rest over <t:${unix(new Date(ctx.now.getTime() + rest * 1000))}:R>`;
  }
  const last = created[created.length - 1];
  return {
    content,
    buttons: [
      { label: "Same again", id: `again:${last.id}`, style: "primary" },
      { label: created.length > 1 ? "Undo last set" : "Undo", id: `undo:${last.id}`, style: "secondary" },
    ],
  };
}

async function log(ctx: BotContext, text: string): Promise<BotReply> {
  const u = await requireUser(ctx);
  const parsed = parseShorthand(text);
  if (!parsed) throw new UserError('Couldn\'t read that. Try `bench 185x5`, `bench 185x5x3`, `squat 225 5,5,4` or `ohp 95x8 @8`.');
  const exercises = await ctx.data.listExercises(u.id);
  let ex: Exercise | null = null;
  if (parsed.exercise) {
    ex = matchExercise(parsed.exercise, exercises, ctx.cfg.logging.aliases);
    if (!ex) throw new UserError(`No lift matches "${parsed.exercise}". Add it in the app, or check the spelling.`);
  } else {
    // No name: continue the lift you logged last in this workout.
    const open = await ctx.data.getOpenSession(u.id);
    const sets = open ? await ctx.data.listSets(u.id, { sessionId: open.id }) : [];
    const lastEx = sets[sets.length - 1]?.exerciseId;
    ex = exercises.find((e) => e.id === lastEx) ?? null;
    if (!ex) throw new UserError("Which lift? e.g. `/log bench 185x5`");
  }
  const entries = parsed.sets.map((s) => ({ weightKg: toKg(s.weight, s.unit ?? u.unit), reps: s.reps, rpe: s.rpe }));
  return logParsed(ctx, u, ex, entries);
}

async function undo(ctx: BotContext): Promise<BotReply> {
  const u = await requireUser(ctx);
  const open = await ctx.data.getOpenSession(u.id);
  const sets = open ? await ctx.data.listSets(u.id, { sessionId: open.id }) : [];
  const last = sets[sets.length - 1];
  if (!last) return { content: "Nothing to undo: no sets in an open workout." };
  return removeSet(ctx, u, last);
}

async function removeSet(ctx: BotContext, u: BotUser, s: SetEntry): Promise<BotReply> {
  await ctx.data.deleteSet(u.id, s.id);
  await rebuild(ctx, u.id, s.exerciseId);
  const ex = (await ctx.data.listExercises(u.id)).find((e) => e.id === s.exerciseId);
  return { content: `↩️ Removed **${ex?.name ?? "set"}** ${num(s.weightKg, u.unit)} × ${s.reps} ${u.unit}` };
}

async function done(ctx: BotContext): Promise<BotReply> {
  const u = await requireUser(ctx);
  const open = await ctx.data.getOpenSession(u.id);
  if (!open) return { content: "No workout in progress. Start one with `/log`." };
  const [split, sets, exercises] = await Promise.all([ctx.data.getActiveSplit(u.id), ctx.data.listSets(u.id, { sessionId: open.id }), ctx.data.listExercises(u.id)]);
  await ctx.data.finishSession(u.id, open.id, ctx.now);
  const exIds = [...new Set(sets.map((s) => s.exerciseId))];
  const events = (await Promise.all(exIds.map((id) => rebuild(ctx, u.id, id)))).flat().filter((e) => e.sessionId === open.id && !e.baseline);
  const name = new Map(exercises.map((e) => [e.id, e.name]));
  const mins = Math.max(1, Math.round((ctx.now.getTime() - Date.parse(open.startedAt)) / 60_000));
  const working = sets.filter((s) => !s.isWarmup);
  const dayName = findDay(split, open.splitDayId)?.name ?? "Workout";

  // One line per lift and PR type (several sets can each beat the old record).
  const best = new Map<string, PREvent>();
  for (const e of events) {
    const k = `${e.exerciseId}:${e.type}`;
    if (!best.has(k) || e.value >= best.get(k)!.value) best.set(k, e);
  }
  const prLines = [...best.values()].map((e) =>
    e.type === "session_volume" ? `🏆 ${name.get(e.exerciseId)}: ${PR_LABEL[e.type]} (${wt(ctx, e.value, u.unit)})` : `🏆 ${name.get(e.exerciseId)}: ${PR_LABEL[e.type]} (${num(e.weightKg, u.unit)} × ${e.reps})`,
  );
  const next = await ctx.data.getToday(u.id, ctx.now);
  const nextText = next.kind === "day" ? `Next up: **${next.day.name}**` : next.kind === "rest" ? "Next: rest day" : "";
  return {
    content: [
      `🎉 **${dayName} done**: ${working.length} sets · ${wt(ctx, volumeKg(working), u.unit)} volume · ${mins} min`,
      ...prLines,
      nextText,
    ].filter(Boolean).join("\n"),
  };
}

async function skip(ctx: BotContext): Promise<BotReply> {
  const u = await requireUser(ctx);
  if (await ctx.data.getOpenSession(u.id)) return { content: "You have a workout in progress. Finish it with `/done` first." };
  const split = await ctx.data.getActiveSplit(u.id);
  if (!split || !split.days.length) return { content: `No active split. Set one up at ${ctx.appUrl}/split.` };
  if (split.mode === "weekly") return { content: "Weekly splits follow the calendar, so there's nothing to skip. Use `/swap` to train a different day." };
  const t = await ctx.data.getToday(u.id, ctx.now);
  if (t.kind !== "day") return { content: "Nothing to skip today." };
  const pos = nextPosition(split, t.day.position);
  await ctx.data.setNextPosition(u.id, pos);
  const nextDay = split.days.find((d) => d.position === pos);
  return { content: `⏭️ Skipped **${t.day.name}**. Next up: **${nextDay?.name ?? "?"}**` };
}

async function swap(ctx: BotContext, query: string): Promise<BotReply> {
  const u = await requireUser(ctx);
  if (await ctx.data.getOpenSession(u.id)) return { content: "You have a workout in progress. Finish it with `/done` first." };
  const split = await ctx.data.getActiveSplit(u.id);
  if (!split || !split.days.length) return { content: `No active split. Set one up at ${ctx.appUrl}/split.` };
  const q = query.trim().toLowerCase();
  const target = split.days.find((d) => d.id === query) ?? split.days.find((d) => d.name.toLowerCase() === q) ?? split.days.find((d) => d.name.toLowerCase().startsWith(q));
  if (!target) return { content: `No day called "${query}". Your days: ${split.days.map((d) => d.name).join(", ")}` };
  if (split.mode === "rotation") {
    await ctx.data.setNextPosition(u.id, target.position);
    return { content: `🔀 Today is now **${target.name}**.` };
  }
  // Weekly mode has no pointer to move, so start the chosen day now.
  await ctx.data.startSession(u.id, target.id, ctx.now);
  return { content: `🔀 Started **${target.name}** for today. Log with \`/log\`.` };
}

async function lift(ctx: BotContext, query: string): Promise<BotReply> {
  const u = await requireUser(ctx);
  const exercises = await ctx.data.listExercises(u.id);
  const ex = exercises.find((e) => e.id === query) ?? matchExercise(query, exercises, ctx.cfg.logging.aliases);
  if (!ex) return { content: `No lift matches "${query}".` };
  const [sets, sessions] = await Promise.all([ctx.data.listSets(u.id, { exerciseId: ex.id }), ctx.data.listSessions(u.id)]);
  if (!sets.some((s) => !s.isWarmup)) return { content: `No sets logged for **${ex.name}** yet.` };
  const rec = currentRecords(replayPRs(sets, sessions, ctx.cfg));
  const last = lastSessionSets(sets, null).filter((s) => !s.isWarmup);
  const lastDate = last.length ? new Date(last[0].createdAt) : null;
  const gains = percentageGains(sets, ctx.now, ctx.cfg).filter((g) => g.percent != null);
  const lines = [`**${ex.name}**`];
  if (lastDate) lines.push(`Last (<t:${unix(lastDate)}:d>): ${last.map((s) => setText(s, u.unit)).join(", ")} ${u.unit}`);
  const recs: string[] = [];
  if (rec.weight) recs.push(`Heaviest ${wt(ctx, rec.weight.weightKg, u.unit)} × ${rec.weight.reps}`);
  if (rec.e1rm) recs.push(`Best e1RM ${wt(ctx, rec.e1rm.value, u.unit)} (${num(rec.e1rm.weightKg, u.unit)}×${rec.e1rm.reps})`);
  if (rec.session_volume) recs.push(`Best volume ${wt(ctx, rec.session_volume.value, u.unit)}`);
  if (recs.length) lines.push(`🏆 ${recs.join(" · ")}`);
  if (gains.length) lines.push(`📈 ${gains.map((g) => `${g.percent! >= 0 ? "+" : ""}${g.percent!.toFixed(1)}% vs ${g.label.toLowerCase()}`).join(" · ")}`);
  return { content: lines.join("\n") };
}

async function streak(ctx: BotContext): Promise<BotReply> {
  const u = await requireUser(ctx);
  const sessions = await ctx.data.listSessions(u.id);
  const target = ctx.cfg.dashboard.weeklyTarget;
  const thisWeek = finishedBetween(sessions, weekStart(ctx.now, ctx.cfg.split.weekStartsOn), new Date(ctx.now.getTime() + 1)).length;
  const n = weeklyStreak(sessions, ctx.now, ctx.cfg.split.weekStartsOn, target);
  return { content: `🔥 **${n} week${n === 1 ? "" : "s"}** in a row with ${target}+ sessions\nThis week: ${thisWeek}/${target}` };
}

async function friends(ctx: BotContext): Promise<BotReply> {
  const u = await requireUser(ctx);
  const list = await ctx.data.friendsToday(u.id, ctx.now);
  if (!list.length) return { content: `No friends yet. Share your QR code from ${ctx.appUrl}/friends` };
  const lines = list.map((f) => {
    const n = f.setsToday ?? 0;
    if (f.kind === "hidden") return `🙈 ${f.displayName}: status hidden`;
    if (f.kind === "rest") return n > 0 ? `✅ ${f.displayName}: rest day, trained anyway (${n} sets)` : `💤 ${f.displayName}: rest day`;
    if (f.kind === "no-split") return n > 0 ? `✅ ${f.displayName}: ${n} sets today` : `▫️ ${f.displayName}: no split set up`;
    return n > 0 ? `✅ ${f.displayName}: ${f.dayName}, logged (${n} sets)` : `⏳ ${f.displayName}: ${f.dayName}, not yet`;
  });
  const lifting = list.filter((f) => f.kind === "day");
  const loggedCount = lifting.filter((f) => (f.setsToday ?? 0) > 0).length;
  return { content: `👥 **Friends today**: ${loggedCount}/${lifting.length} lift days logged\n${lines.join("\n")}` };
}

async function plates(ctx: BotContext, weight: number, unitOpt?: string): Promise<BotReply> {
  const u = unitOpt ? null : await ctx.data.findUser(ctx.discordUserId).catch(() => null);
  const unit: Unit = unitOpt === "kg" || unitOpt === "lb" ? unitOpt : u?.unit ?? ctx.cfg.units.default;
  const bar = ctx.cfg.plates.bar[unit];
  if (!(weight > 0)) return { content: "Give a weight, e.g. `/plates 225`." };
  if (weight < bar) return { content: `That's less than the bar (${bar} ${unit}).` };
  const r = platesPerSide(weight, bar, ctx.cfg.plates.available[unit]);
  let content = `🏋️ **${weight} ${unit}**: ${r.plates.length ? r.plates.join(" + ") : "empty bar"} per side (bar ${bar})`;
  if (r.remainder > 0) content += `\n-# ${r.remainder} ${unit} can't be loaded with your plates.`;
  return { content };
}

async function rest(ctx: BotContext, time?: string): Promise<BotReply> {
  const secs = time ? parseDuration(time) : ctx.cfg.restTimer.defaultSeconds;
  if (secs == null || secs <= 0) return { content: "Try `/rest 2m`, `/rest 90` or `/rest 1:30`." };
  const s = Math.min(secs, ctx.cfg.bot.maxRestSeconds);
  return { content: `⏱ Rest ${formatDuration(s)}, over <t:${unix(new Date(ctx.now.getTime() + s * 1000))}:R>` };
}

// ------------------------------------------------------------------ entry points

async function guard(fn: () => Promise<BotReply>): Promise<BotReply> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return { content: e.message };
    console.error("[bot]", e);
    return { content: `⚠️ Something went wrong: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function handleCommand(ctx: BotContext, name: string, opts: Options): Promise<BotReply> {
  return guard(async () => {
    switch (name) {
      case "today": return today(ctx);
      case "log": return log(ctx, String(opts.sets ?? ""));
      case "undo": return undo(ctx);
      case "done": return done(ctx);
      case "skip": return skip(ctx);
      case "swap": return swap(ctx, String(opts.day ?? ""));
      case "lift": return lift(ctx, String(opts.name ?? ""));
      case "streak": return streak(ctx);
      case "friends": return friends(ctx);
      case "plates": return plates(ctx, Number(opts.weight), opts.unit as string | undefined);
      case "rest": return rest(ctx, opts.time as string | undefined);
      default: return { content: `Unknown command /${name}` };
    }
  });
}

/** Buttons. "again" posts a new message; "undo" and "skip" replace the message they're on. */
export function componentMode(customId: string): "new" | "update" {
  return customId.startsWith("again:") ? "new" : "update";
}

export function handleComponent(ctx: BotContext, customId: string): Promise<BotReply> {
  return guard(async () => {
    const [kind, id] = customId.split(":");
    if (kind === "skip") return skip(ctx);
    const u = await requireUser(ctx);
    const s = id ? await ctx.data.getSet(u.id, id) : null; // scoped to this user: nobody else's sets
    if (kind === "undo") return s ? removeSet(ctx, u, s) : { content: "Already removed." };
    if (kind === "again") {
      if (!s) return { content: "That set no longer exists." };
      const open = await ctx.data.getOpenSession(u.id);
      if (!open || open.id !== s.sessionId) return { content: "That workout is finished. Use `/log` to start a new one." };
      const ex = (await ctx.data.listExercises(u.id)).find((e) => e.id === s.exerciseId);
      if (!ex) return { content: "That lift no longer exists." };
      return logParsed(ctx, u, ex, [{ weightKg: s.weightKg, reps: s.reps, rpe: s.rpe }]);
    }
    return { content: "Unknown button." };
  });
}

export async function handleAutocomplete(ctx: BotContext, command: string, value: string): Promise<{ name: string; value: string }[]> {
  try {
    const u = await ctx.data.findUser(ctx.discordUserId);
    if (!u) return [];
    const q = value.trim().toLowerCase();
    if (command === "lift") {
      const exercises = await ctx.data.listExercises(u.id);
      const alias = matchExercise(q, exercises, ctx.cfg.logging.aliases);
      const hits = exercises.filter((e) => !q || e.name.toLowerCase().includes(q));
      const ordered = alias ? [alias, ...hits.filter((e) => e.id !== alias.id)] : hits;
      return ordered.slice(0, 25).map((e) => ({ name: e.name, value: e.name }));
    }
    if (command === "swap") {
      const split = await ctx.data.getActiveSplit(u.id);
      return (split?.days ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .filter((d) => !q || d.name.toLowerCase().includes(q))
        .slice(0, 25)
        .map((d) => ({ name: d.name, value: d.name }));
    }
  } catch (e) {
    console.error("[bot] autocomplete", e);
  }
  return [];
}
