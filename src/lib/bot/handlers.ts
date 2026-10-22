import type { AppConfig, Unit } from "@/config/app.config";
import { percentageGains } from "@/lib/domain/gain";
import { FREETEXT_HELP, parseFreeText } from "@/lib/domain/freetext";
import { bodyweightTrend } from "@/lib/domain/bodyweight";
import { goalProgress } from "@/lib/domain/goals";
import { describeGoal, outlookText, progressText } from "@/lib/domain/goalText";
import { matchExercise } from "@/lib/domain/match";
import { platesPerSide } from "@/lib/domain/plates";
import { prefillFor } from "@/lib/domain/progression";
import { currentRecords, prsForSet, replayPRs } from "@/lib/domain/prs";
import { localDate, nextPosition } from "@/lib/domain/split";
import { finishedBetween, volumeKg, weekStart, freezeRules, streakInfo, weeklyStreak } from "@/lib/domain/stats";
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
  /** A dropdown (Discord string select), e.g. "which lift did you mean?". */
  select?: { id: string; placeholder: string; options: { label: string; value: string; description?: string }[] };
}

export interface BotContext {
  data: BotData;
  cfg: AppConfig;
  now: Date;
  discordUserId: string;
  appUrl: string;
  /** Server channel the command was used in (for /announce). */
  channelId?: string;
  guildId?: string;
  /** Posts to a server channel with the bot token; absent in tests unless faked. */
  post?: (channelId: string, reply: BotReply) => Promise<void>;
}

export type Options = Record<string, string | number | boolean | undefined>;

const PR_LABEL: Record<PRType, string> = { weight: "Heaviest", reps_at_weight: "Rep PR", e1rm: "e1RM PR", session_volume: "Volume PR" };

/** Commands that work without a linked account and need no database. */
export const ACCOUNTLESS = new Set(["plates", "rest", "help"]);

/** "🏆 Cee just hit a Bench Press e1RM PR: 190 × 5 lb!" */
export function announcementText(name: string, exercise: string, prs: PRType[], s: SetEntry, unit: Unit): string {
  const kinds = prs.filter((p) => p !== "session_volume").map((p) => PR_LABEL[p].replace(" PR", ""));
  return `🏆 **${name}** just hit a **${exercise}** PR (${kinds.join(", ")}): ${num(s.weightKg, unit)} × ${s.reps} ${unit}!`;
}

class UserError extends Error {}

const wt = (ctx: BotContext, kg: number, unit: Unit) => formatWeight(kg, unit, ctx.cfg.units.displayDecimals);
const num = (kg: number, unit: Unit) => String(Number(fromKg(kg, unit).toFixed(1)));
const setText = (s: SetEntry, unit: Unit) => `${num(s.weightKg, unit)}×${s.reps}`;

async function requireUser(ctx: BotContext): Promise<BotUser> {
  const u = await ctx.data.findUser(ctx.discordUserId);
  if (!u) throw new UserError(`👋 Hey, I'm ${ctx.cfg.brand.botName}. I don't know you yet. Sign in at ${ctx.appUrl} with this Discord account, then try again.`);
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
  if (prs.size) {
    content += `\n🏆 ${[...prs].map((p) => PR_LABEL[p]).join(", ")}!`;
    // Opt-in public announcement, once per PR set.
    const prSet = [...created].reverse().find((s) => prsForSet(events, s.id).length);
    if (prSet && u.announcePrs && u.announceChannelId && ctx.post && (await ctx.data.claimAnnouncement(u.id, prSet.id))) {
      await ctx.post(u.announceChannelId, { content: announcementText(u.displayName, ex.name, prsForSet(events, prSet.id), prSet, u.unit) }).catch((e) => console.error("[bot] announce", e));
    }
  }
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

// ------------------------------------------------------------------ /log with Confirm

type Entry = { weightKg: number; reps: number; rpe: number | null };

/** Sets → "83.915*8*4,90*5*1" (kg*reps*count[*rpe]) so a button can carry them; nothing is stored until Confirm. */
export function encodeEntries(entries: Entry[]): string {
  const groups: { e: Entry; n: number }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.e.weightKg === e.weightKg && last.e.reps === e.reps && last.e.rpe === e.rpe) last.n++;
    else groups.push({ e, n: 1 });
  }
  return groups.map(({ e, n }) => [Number(e.weightKg.toFixed(3)), e.reps, n, ...(e.rpe != null ? [e.rpe] : [])].join("*")).join(",");
}

export function decodeEntries(s: string): Entry[] {
  return s.split(",").flatMap((g) => {
    const [w, r, n, rpe] = g.split("*").map(Number);
    if (!(w >= 0) || !(r >= 1) || !(n >= 1) || n > 50) return [];
    return Array.from({ length: n }, () => ({ weightKg: w, reps: r, rpe: Number.isFinite(rpe) ? rpe : null }));
  });
}

function describeEntries(entries: Entry[], unit: Unit): string {
  const groups = encodeEntries(entries).split(",").map((g) => {
    const [w, r, n, rpe] = g.split("*").map(Number);
    return `${n > 1 ? `${n} × ` : ""}${r} rep${r === 1 ? "" : "s"} @ ${num(w, unit)} ${unit}${Number.isFinite(rpe) ? ` (RPE ${rpe})` : ""}`;
  });
  return groups.join(", ");
}

function confirmReply(ex: Exercise, entries: Entry[], unit: Unit): BotReply {
  const id = `lc:${ex.id}:${encodeEntries(entries)}`;
  if (id.length > 100) return { content: "That's a lot of different sets for one message. Log them in two goes." };
  return {
    content: `📝 **${ex.name}**: ${describeEntries(entries, unit)}
Save ${entries.length === 1 ? "this set" : `these ${entries.length} sets`}?`,
    buttons: [
      { label: "Confirm", id, style: "primary" },
      { label: "Cancel", id: "lx", style: "secondary" },
    ],
  };
}

/** Best guesses first, so the menu usually has the right lift near the top (max 25 options). */
function rankLifts(query: string | null, exercises: Exercise[], preferIds: string[] = []): Exercise[] {
  const q = (query ?? "").toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const score = (e: Exercise) => {
    const n = e.name.toLowerCase();
    let sc = preferIds.includes(e.id) ? 5 : 0;
    if (q && n.startsWith(q)) sc += 40;
    if (q && n.includes(q)) sc += 20;
    sc += words.filter((w) => n.includes(w)).length * 10;
    if (q && n.split(/\s+/).some((w) => w[0] === q[0])) sc += 2;
    return sc;
  };
  return [...exercises].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, 25);
}

function pickReply(entries: Entry[], unit: Unit, options: Exercise[], typed: string | null): BotReply {
  const id = `lp:${encodeEntries(entries)}`;
  if (id.length > 100) return { content: "That's a lot of different sets for one message. Log them in two goes." };
  return {
    content: `${typed ? `I don't have a lift called **${typed}**.` : "Which lift?"} Pick one for ${describeEntries(entries, unit)}:`,
    select: { id, placeholder: "Choose a lift", options: options.map((e) => ({ label: e.name, value: e.id, description: e.category })) },
    buttons: [{ label: "Cancel", id: "lx", style: "secondary" }],
  };
}

const PARSE_HELP: Record<string, string> = {
  "missing-weight": "I got the sets and reps but no weight.",
  unclear: "I couldn't tell which number is the weight.",
  "too-many-sets": "That's more than 20 sets in one go.",
  "no-numbers": "I didn't see any numbers.",
  empty: "Tell me what you lifted.",
};

/** /log: parse free text, then ask to Confirm. Nothing is saved here. */
async function log(ctx: BotContext, text: string): Promise<BotReply> {
  const u = await requireUser(ctx);
  const parsed = parseFreeText(text);
  if (!parsed.ok) throw new UserError(`${PARSE_HELP[parsed.reason] ?? "Couldn't read that."} ${FREETEXT_HELP}`);
  const entries = parsed.sets.map((s) => ({ weightKg: toKg(s.weight, s.unit ?? u.unit), reps: s.reps, rpe: s.rpe }));
  const exercises = await ctx.data.listExercises(u.id);

  if (parsed.exercise) {
    const ex = matchExercise(parsed.exercise, exercises, ctx.cfg.logging.aliases);
    return ex ? confirmReply(ex, entries, u.unit) : pickReply(entries, u.unit, rankLifts(parsed.exercise, exercises), parsed.exercise);
  }
  // No name: default to the lift logged last in this workout, else ask (today's plan first).
  const open = await ctx.data.getOpenSession(u.id);
  const sets = open ? await ctx.data.listSets(u.id, { sessionId: open.id }) : [];
  const last = exercises.find((e) => e.id === sets[sets.length - 1]?.exerciseId);
  if (last) return confirmReply(last, entries, u.unit);
  const t = await ctx.data.getToday(u.id, ctx.now);
  const planned = t.kind === "day" ? t.day.exercises.map((x) => x.exerciseId) : [];
  return pickReply(entries, u.unit, rankLifts(null, exercises, planned), null);
}

/** [Confirm] saves through the same path as every other log; the menu turns a pick into a Confirm. */
async function confirmOrPick(ctx: BotContext, customId: string, values: string[]): Promise<BotReply> {
  const u = await requireUser(ctx);
  const parts = customId.split(":");
  const exercises = await ctx.data.listExercises(u.id); // the user's own + library: an id from elsewhere won't match
  if (parts[0] === "lp") {
    const ex = exercises.find((e) => e.id === values[0]);
    const entries = decodeEntries(parts[1] ?? "");
    if (!ex || !entries.length) return { content: "That choice expired. Run `/log` again." };
    return confirmReply(ex, entries, u.unit);
  }
  const ex = exercises.find((e) => e.id === parts[1]);
  const entries = decodeEntries(parts[2] ?? "");
  if (!ex || !entries.length) return { content: "That log expired. Run `/log` again." };
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
  const st = streakInfo(sessions, ctx.now, ctx.cfg.split.weekStartsOn, target, freezeRules(ctx.cfg));
  const n = st.weeks;
  const ice = st.freezes ? `\n🧊 ${st.freezes} streak freeze${st.freezes === 1 ? "" : "s"} saved: a missed week won't reset it.` : "";
  return { content: `🔥 **${n} week${n === 1 ? "" : "s"}** in a row with ${target}+ sessions\nThis week: ${thisWeek}/${target}${ice}` };
}

async function friends(ctx: BotContext): Promise<BotReply> {
  const u = await requireUser(ctx);
  const list = await ctx.data.friendsToday(u.id, ctx.now);
  if (!list.length) return { content: `No friends yet. Share your QR code from ${ctx.appUrl}/friends` };
  const lines = list.map((raw) => {
    const f = { ...raw, displayName: raw.nickname || raw.displayName };
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

/** "▰▰▰▰▱▱▱▱▱▱" */
function textBar(pct: number, width = 10): string {
  const n = Math.round(Math.max(0, Math.min(1, pct)) * width);
  return "▰".repeat(n) + "▱".repeat(width - n);
}

async function goals(ctx: BotContext): Promise<BotReply> {
  const u = await requireUser(ctx);
  const [list, sets, sessions, exercises] = await Promise.all([ctx.data.listGoals(u.id), ctx.data.listSets(u.id), ctx.data.listSessions(u.id), ctx.data.listExercises(u.id)]);
  if (!list.length) return { content: `🎯 No goals yet. Set one on the Progress page: ${ctx.appUrl}/progress` };
  const name = new Map(exercises.map((e) => [e.id, e.name]));
  const lines = list.map((g) => {
    const p = goalProgress(g, sets, sessions, ctx.now, ctx.cfg);
    const outlook = outlookText(g, p);
    return `**${describeGoal(g, g.exerciseId ? name.get(g.exerciseId) ?? null : null, u.unit)}**\n${textBar(p.pct)} ${progressText(g, p, u.unit)}${outlook ? ` · ${outlook}` : ""}`;
  });
  return { content: `🎯 **Your goals**\n${lines.join("\n")}\n-# Projections use your last 8 weeks and are estimates.` };
}

const signed = (n: number, unit: Unit) => `${n >= 0 ? "+" : "−"}${Math.abs(Number(fromKg(n, unit).toFixed(1)))} ${unit}`;

async function bodyweight(ctx: BotContext, weight: number | undefined, unitOpt?: string): Promise<BotReply> {
  const u = await requireUser(ctx);
  const today = localDate(ctx.now, u.timezone);
  if (weight !== undefined) {
    const unit: Unit = unitOpt === "kg" || unitOpt === "lb" ? unitOpt : u.unit;
    const kg = toKg(weight, unit);
    // Sanity range: 25–300 kg (55–660 lb). A typo like 1800 shouldn't wreck the chart.
    if (!(kg >= 25 && kg <= 300)) return { content: `That doesn't look like a bodyweight. Try \`/bodyweight 182\` (in ${unit}).` };
    await ctx.data.logBodyweight(u.id, today, kg);
  }
  const entries = await ctx.data.listBodyweight(u.id);
  if (!entries.length) return { content: `⚖️ No bodyweight logged yet. Try \`/bodyweight 182\`. The chart is on ${ctx.appUrl}/progress` };
  const tr = bodyweightTrend(entries, today);
  const lines = [weight !== undefined ? `⚖️ Logged **${wt(ctx, tr.latest!.weightKg, u.unit)}** for today.` : `⚖️ Latest: **${wt(ctx, tr.latest!.weightKg, u.unit)}** (${tr.latest!.date})`];
  if (tr.avg7 != null) lines.push(`7-day average: ${wt(ctx, tr.avg7, u.unit)}${tr.change28 != null ? ` (${signed(tr.change28, u.unit)} vs 4 weeks ago)` : ""}`);
  if (tr.perWeek != null) lines.push(`Trend: ${signed(tr.perWeek, u.unit)} per week`);
  lines.push("-# Daily weight swings with water and food; the average is the number to watch.");
  return { content: lines.join("\n") };
}

const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;

async function leaderboard(ctx: BotContext, mode: string): Promise<BotReply> {
  const u = await requireUser(ctx);
  if (mode === "join" || mode === "leave") await ctx.data.setLeaderboard(u.id, mode === "join");
  if (mode === "leave") return { content: "👋 You're off the leaderboard. Friends won't see your % gain. `/leaderboard join` any time." };
  const rows = await ctx.data.leaderboard(u.id, ctx.now);
  if (!rows) {
    return {
      content: [
        "🏆 **Leaderboard** ranks you and friends who opted in by **% strength gain**: your best estimated 1RM per lift over the last 4 weeks vs 2–3 months ago, averaged.",
        "Percent, not pounds, so a beginner and a veteran can compete fairly. Only the % and your top lift are shared, never your weights.",
        "Join with `/leaderboard join`.",
      ].join("\n"),
    };
  }
  const ranked = rows.filter((r) => r.avgGain != null);
  const medal = ["🥇", "🥈", "🥉"];
  const lines = ranked.map((r, i) => {
    const who = r.isYou ? `**${r.name} (you)**` : r.name;
    return `${medal[i] ?? `${i + 1}.`} ${who} ${pct(r.avgGain!)} avg over ${r.lifts} lift${r.lifts === 1 ? "" : "s"}${r.topLift ? ` · best: ${r.topLift} ${pct(r.topGain!)}` : ""}`;
  });
  const waiting = rows.filter((r) => r.avgGain == null).map((r) => (r.isYou ? "you" : r.name));
  return {
    content: [
      `🏆 **Leaderboard** (% strength gain, last 4 weeks vs 2–3 months ago)${mode === "join" ? "\nYou're in!" : ""}`,
      lines.length ? lines.join("\n") : "Nobody has enough history yet. A lift counts once it was logged both 2–3 months ago and in the last 4 weeks.",
      waiting.length ? `-# Not enough history yet: ${waiting.join(", ")}` : "",
      "-# Friends show up once they `/leaderboard join`. `/leaderboard leave` to opt out.",
    ].filter(Boolean).join("\n"),
  };
}

function help(ctx: BotContext): BotReply {
  const bot = ctx.cfg.brand.botName;
  return {
    content: [
      `👋 **${bot} · ${ctx.cfg.brand.appName}**`,
      `**Log a set:** \`/log\` with plain text. ${FREETEXT_HELP} You'll get Confirm / Cancel first. Short names work too: \`ohp\`, \`rdl\`, initials like \`bp\`.`,
      "**Your day:** `/today` · `/done` to finish · `/skip` · `/swap` · `/undo` the last set",
      "**Progress:** `/lift` · `/streak` · `/goal` · `/bodyweight 182` · `/friends` · `/leaderboard`",
      "**Tools:** `/plates 225` · `/rest 2m` · `/announce on` (post PRs in this channel)",
      `**Ask me:** \`/ask\` reads your logged data and answers (AI, not medical advice). In the app, the Ask ${bot} chat can also propose changes for you to approve.`,
      `**Account:** sign in at ${ctx.appUrl} with Discord (or link Discord in Settings if you use Google) so I know it's you.`,
    ].join("\n"),
  };
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

async function announce(ctx: BotContext, mode: string): Promise<BotReply> {
  const u = await requireUser(ctx);
  if (mode === "off") {
    await ctx.data.setAnnounce(u.id, null, false);
    return { content: "🔕 PR announcements are off." };
  }
  if (!ctx.guildId || !ctx.channelId) return { content: "Run `/announce on` inside a server channel where your PRs should be posted." };
  if (!ctx.post) return { content: "Announcements aren't available right now." };
  try {
    await ctx.post(ctx.channelId, { content: `✅ PRs from **${u.displayName}** will be posted here. (\`/announce off\` to stop)` });
  } catch {
    return { content: "I can't post in this channel. A server admin needs to add the bot to this server (not just your account) with **View Channel** and **Send Messages**." };
  }
  await ctx.data.setAnnounce(u.id, ctx.channelId, true);
  return { content: "📣 Done. Your PRs from the app and Discord will be announced in this channel." };
}

// ------------------------------------------------------------------ daily check-in

export function checkInButtons(reminderId: string, rotation: boolean): Button[] {
  return [
    { label: "Start workout", id: "ci:start", style: "primary" },
    { label: "Rest day", id: "ci:rest", style: "secondary" },
    ...(rotation ? [{ label: "Skip", id: "ci:skip", style: "secondary" as const }] : []),
    { label: "Snooze", id: `ci:snooze:${reminderId}`, style: "secondary" },
  ];
}

async function checkInStart(ctx: BotContext): Promise<BotReply> {
  const u = await requireUser(ctx);
  const open = await ctx.data.getOpenSession(u.id);
  if (open) return { content: "🏋️ You already have a workout going. Log with `/log`." };
  const t = await ctx.data.getToday(u.id, ctx.now);
  const day = t.kind === "day" ? t.day : null;
  await ctx.data.startSession(u.id, day?.id ?? null, ctx.now);
  const hint = day?.exercises[0] ? (await ctx.data.listExercises(u.id)).find((e) => e.id === day.exercises[0].exerciseId)?.name : null;
  return { content: `🏋️ Started **${day?.name ?? "a workout"}**. Log with \`/log ${hint ? hint.toLowerCase() + " " : ""}135x8\`, finish with \`/done\`.` };
}

async function checkInSnooze(ctx: BotContext, reminderId: string): Promise<BotReply> {
  const u = await requireUser(ctx);
  const mins = ctx.cfg.reminders.snoozeMinutes;
  const until = new Date(ctx.now.getTime() + mins * 60_000);
  const ok = await ctx.data.snoozeReminder(u.id, reminderId, until);
  return { content: ok ? `⏰ Snoozed. I'll ask again <t:${unix(until)}:R>.` : "That reminder no longer exists." };
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
      case "announce": return announce(ctx, String(opts.mode ?? "on"));
      case "goal": return goals(ctx);
      case "bodyweight": return bodyweight(ctx, opts.weight === undefined ? undefined : Number(opts.weight), opts.unit as string | undefined);
      case "leaderboard": return leaderboard(ctx, String(opts.mode ?? "view"));
      case "help": return help(ctx);
      default: return { content: `Unknown command /${name}` };
    }
  });
}

/** Buttons. "again" posts a new message; "undo" and "skip" replace the message they're on. */
export function componentMode(customId: string): "new" | "update" {
  // "again" posts a new message; everything else (confirm, cancel, pick, undo, skip, check-in) replaces the one it's on.
  return customId.startsWith("again:") ? "new" : "update";
}

export function handleComponent(ctx: BotContext, customId: string, values: string[] = []): Promise<BotReply> {
  return guard(async () => {
    const [kind, id] = customId.split(":");
    if (kind === "skip") return skip(ctx);
    if (kind === "lx") return { content: "❌ Cancelled. Nothing was saved." };
    if (kind === "lc" || kind === "lp") return confirmOrPick(ctx, customId, values);
    if (kind === "ci") {
      const [, action, rid] = customId.split(":");
      if (action === "start") return checkInStart(ctx);
      if (action === "rest") return { content: "💤 Rest day. Enjoy it, see you next session." };
      if (action === "skip") return skip(ctx);
      if (action === "snooze") return checkInSnooze(ctx, rid ?? "");
    }
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
