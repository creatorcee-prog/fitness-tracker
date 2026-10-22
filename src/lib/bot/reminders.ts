import type { AppConfig } from "@/config/app.config";
import { weighInDue } from "@/lib/domain/bodyweight";
import { outdoorToday, WEATHER_CREDIT, weatherLine } from "@/lib/domain/weather";
import { localDate } from "@/lib/domain/split";
import { fromKg } from "@/lib/domain/units";
import type { BotData, BotUser, DueReminder } from "./data";
import { DiscordError } from "./discord";
import { checkInButtons, type BotReply } from "./handlers";

export interface ReminderDeps {
  data: BotData;
  cfg: AppConfig;
  now: Date;
  appUrl: string;
  sendDM: (discordId: string, reply: BotReply) => Promise<void>;
  /** For the weather forecast (tests pass a fake). */
  fetch?: typeof fetch;
}

export interface ReminderOutcome {
  reminderId: string;
  result: "sent" | "skipped" | "failed" | "retry";
  reason?: string;
}

/**
 * Message for one due reminder, or why it should be skipped.
 * `force` (Settings → Send test reminder) ignores the skip rules so you can see the DM any time.
 */
export async function buildCheckIn(deps: ReminderDeps, r: DueReminder, force = false): Promise<{ reply: BotReply } | { skip: string }> {
  const user = await deps.data.getUserById(r.userId);
  if (!user) return { skip: "user gone" };
  const msg = await workoutCheckIn(deps, r, user, force);
  // Daily checklist lines. They also go out on their own when the workout part
  // is skipped (rest day, trained already), with a note on why you got them.
  const extra: { line: string; why: string }[] = [];
  const entries = await deps.data.listBodyweight(user.id);
  if (weighInDue(entries, r.localDate, deps.cfg.reminders.weighInActiveDays)) {
    const example = Math.round(fromKg(entries[entries.length - 1].weightKg, user.unit));
    extra.push({ line: `⚖️ Don't forget to weigh in today: \`/bodyweight ${example}\``, why: "you've been logging your weight" });
  }
  if (user.weather?.on) {
    const v = await outdoorToday(user.weather, deps.now, deps.fetch ?? fetch);
    // On their own, only good news: "rainy, go to the gym" isn't worth a DM on a rest day.
    const line = v ? weatherLine(v, user.unit) : "";
    if (line && (!("skip" in msg) || v!.kind !== "bad")) extra.push({ line, why: `weather nudges are on (${WEATHER_CREDIT})` });
  }
  if (!extra.length) return msg;
  const lines = extra.map((x) => x.line).join("\n");
  if ("skip" in msg) return { reply: { content: `${lines}\n-# You get this because ${extra.map((x) => x.why).join(" and ")}.` } };
  const credit = extra.some((x) => x.why.includes(WEATHER_CREDIT)) ? `\n-# ${WEATHER_CREDIT}` : "";
  return { reply: { ...msg.reply, content: `${msg.reply.content}\n${lines}${credit}` } };
}

async function workoutCheckIn(deps: ReminderDeps, r: DueReminder, user: BotUser, force: boolean): Promise<{ reply: BotReply } | { skip: string }> {
  const { data, cfg, now } = deps;

  if (cfg.reminders.skipIfTrainedToday && !force) {
    const sessions = await data.listSessions(user.id);
    if (sessions.some((s) => localDate(new Date(s.startedAt), user.timezone) === r.localDate)) return { skip: "already trained today" };
  }

  const today = await data.getToday(user.id, now);
  if (today.kind === "rest" && !cfg.reminders.onRestDays && !force) return { skip: "rest day" };

  const split = await data.getActiveSplit(user.id);
  const rotation = split?.mode === "rotation";
  const again = r.snoozed ? " (snoozed reminder)" : "";
  if (today.kind === "rest") return { reply: { content: `💤 Rest day on your split${again}. Train anyway?`, buttons: checkInButtons(r.reminderId, false) } };
  if (today.kind === "no-split") {
    return { reply: { content: `🏋️ Time to train${again}! Log with \`/log bench 185x5\`, or set up a split at ${deps.appUrl}/split.`, buttons: checkInButtons(r.reminderId, false) } };
  }
  const names = new Map((await data.listExercises(user.id)).map((e) => [e.id, e.name]));
  const lifts = [...today.day.exercises].sort((a, b) => a.order - b.order).map((x) => names.get(x.exerciseId)).filter(Boolean);
  return {
    reply: {
      content: `🏋️ **${today.day.name}** is up today${again}${lifts.length ? `: ${lifts.join(", ")}` : ""}.`,
      buttons: checkInButtons(r.reminderId, rotation),
    },
  };
}

/**
 * Sends every due reminder. Called by the cron route each minute.
 * - Skips (and marks done for today) when you've already trained or it's a rest day.
 * - If Discord refuses the DM (no shared server / DMs closed), the reminder is
 *   switched off with an explanation, so the bot doesn't keep making failing
 *   requests that count against Discord's invalid-request limit.
 * - Other errors (Discord down, rate limit) are retried on the next tick.
 */
export async function runReminders(deps: ReminderDeps): Promise<ReminderOutcome[]> {
  const due = await deps.data.dueReminders(deps.now, deps.cfg.reminders.windowMinutes);
  const out: ReminderOutcome[] = [];
  for (const r of due) {
    try {
      const msg = await buildCheckIn(deps, r);
      if ("skip" in msg) {
        await deps.data.markReminderSent(r.reminderId, r.localDate);
        out.push({ reminderId: r.reminderId, result: "skipped", reason: msg.skip });
        continue;
      }
      await deps.sendDM(r.discordId, msg.reply);
      await deps.data.markReminderSent(r.reminderId, r.localDate);
      out.push({ reminderId: r.reminderId, result: "sent" });
    } catch (e) {
      if (e instanceof DiscordError && (e.code === 50007 || e.status === 403)) {
        const why = "Discord won't let the bot DM you. Make sure you're in a server with the bot and allow DMs from server members (Discord → Privacy Settings), then switch the reminder back on.";
        await deps.data.markReminderFailed(r.reminderId, why);
        out.push({ reminderId: r.reminderId, result: "failed", reason: "dm-blocked" });
      } else {
        console.error("[reminders]", e);
        out.push({ reminderId: r.reminderId, result: "retry", reason: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return out;
}

/**
 * Settings → "Send test reminder": DM the user their check-in right now,
 * ignoring the skip rules and without touching the reminder's daily state.
 */
export async function sendTestReminder(deps: ReminderDeps, userId: string, reminderId = "test"): Promise<{ ok: boolean; message: string }> {
  const user = await deps.data.getUserById(userId);
  if (!user) return { ok: false, message: "Account not found." };
  if (!user.discordId) return { ok: false, message: "Your account isn't linked to Discord. Sign in with Discord to get reminders." };
  const msg = await buildCheckIn(deps, { reminderId, userId, discordId: user.discordId, localDate: localDate(deps.now, user.timezone), snoozed: false }, true);
  if ("skip" in msg) return { ok: false, message: `Couldn't build the reminder (${msg.skip}).` };
  try {
    await deps.sendDM(user.discordId, { ...msg.reply, content: `🧪 **Test reminder**\n${msg.reply.content}` });
    return { ok: true, message: `Sent! Check your Discord DMs from ${deps.cfg.brand.botName}.` };
  } catch (e) {
    if (e instanceof DiscordError && (e.code === 50007 || e.status === 403)) {
      return { ok: false, message: "Discord won't let the bot DM you. Make sure you're in a server with the bot and allow DMs from server members (Discord → Privacy Settings)." };
    }
    return { ok: false, message: `Discord error: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}` };
  }
}
