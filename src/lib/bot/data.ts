import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig, Unit } from "@/config/app.config";
import { e1rm } from "@/lib/domain/e1rm";
import type { Goal } from "@/lib/domain/goals";
import type { Today } from "@/lib/domain/split";
import type { Exercise, FriendStatus, PREvent, Session, SetEntry, Split } from "@/lib/domain/types";
import { check, toExercise, toGoal, toSession, toSet, toSplit } from "@/lib/store/supabase";
import type { NewSet } from "@/lib/store/types";

export interface BotUser {
  id: string;
  displayName: string;
  unit: Unit;
  timezone: string;
  /** Channel chosen with /announce on; PRs are posted there when announcePrs is true. */
  announceChannelId: string | null;
  announcePrs: boolean;
  /** Linked Discord account (null if signed up some other way). */
  discordId: string | null;
  /** First sign-in setup answers, for James (absent before migration 0013). */
  about?: import("@/lib/domain/about").About;
}

/** Goals as stored (see src/lib/domain/goals.ts). */
export type GoalRow = Goal;

export interface DueReminder {
  reminderId: string;
  userId: string;
  discordId: string;
  /** User's local date (YYYY-MM-DD) the reminder is for. */
  localDate: string;
  snoozed: boolean;
}

/**
 * Everything the bot reads or writes, always on behalf of one user (`uid`).
 * The Supabase implementation uses the service-role key, which bypasses
 * row-level security, so EVERY query below filters by user_id explicitly.
 */
export interface BotData {
  findUser(discordId: string): Promise<BotUser | null>;
  getToday(uid: string, now: Date): Promise<Today>;
  getActiveSplit(uid: string): Promise<Split | null>;
  listExercises(uid: string): Promise<Exercise[]>;
  getOpenSession(uid: string): Promise<Session | null>;
  startSession(uid: string, splitDayId: string | null, now: Date): Promise<Session>;
  finishSession(uid: string, sessionId: string, now: Date): Promise<void>;
  setNextPosition(uid: string, position: number): Promise<void>;
  listSessions(uid: string): Promise<Session[]>;
  listSets(uid: string, filter?: { exerciseId?: string; sessionId?: string }): Promise<SetEntry[]>;
  getSet(uid: string, setId: string): Promise<SetEntry | null>;
  addSet(uid: string, s: NewSet): Promise<SetEntry>;
  deleteSet(uid: string, setId: string): Promise<void>;
  savePersonalRecords(uid: string, exerciseId: string, events: PREvent[]): Promise<void>;
  friendsToday(uid: string, now: Date): Promise<FriendStatus[]>;

  getUserById(uid: string): Promise<BotUser | null>;
  setAnnounce(uid: string, channelId: string | null, on: boolean): Promise<void>;
  /** Marks a set as announced; false if it already was (so each PR posts once). */
  claimAnnouncement(uid: string, setId: string): Promise<boolean>;

  dueReminders(now: Date, windowMinutes: number): Promise<DueReminder[]>;
  markReminderSent(reminderId: string, localDate: string): Promise<void>;
  /** Turns the reminder off and records why, so Settings can explain it. */
  markReminderFailed(reminderId: string, error: string): Promise<void>;
  snoozeReminder(uid: string, reminderId: string, until: Date): Promise<boolean>;

  // AI /ask (read-only context + usage caps)
  listGoals(uid: string): Promise<GoalRow[]>;
  /** Bodyweight entries (kg), oldest first. */
  listBodyweight(uid: string): Promise<{ date: string; weightKg: number }[]>;
  /** Leaderboard (% gain) for this user and opted-in friends; null if they haven't opted in. */
  leaderboard(uid: string, now: Date): Promise<import("@/lib/domain/leaderboard").LeaderboardRow[] | null>;
  setLeaderboard(uid: string, on: boolean): Promise<void>;
  /** Log (or replace) a day's bodyweight (kg). */
  logBodyweight(uid: string, date: string, weightKg: number): Promise<void>;
  aiUsageToday(uid: string, date: string): Promise<{ user: number; global: number }>;
  recordAiUsage(uid: string, date: string, tokensIn: number, tokensOut: number): Promise<void>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

// "*" so newer optional columns (setup answers) come along without breaking older databases.
const USER_COLS = "*";
const toBotUser = (r: Row): BotUser => ({
  id: r.id, displayName: r.display_name, unit: r.unit, timezone: r.timezone,
  announceChannelId: r.announce_channel_id ?? null, announcePrs: !!r.announce_prs, discordId: r.discord_id ?? null,
  about: { style: r.training_style ?? null, frequency: r.training_frequency ?? null, experience: r.experience ?? null, heightCm: r.height_cm == null ? null : Number(r.height_cm) },
});

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the Discord bot.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class SupabaseBotData implements BotData {
  private client: SupabaseClient | null = null;

  /** The client is created on first use, so commands that never touch the database still work without it. */
  constructor(private makeClient: () => SupabaseClient, private cfg: AppConfig) {}

  private get sb(): SupabaseClient {
    return (this.client ??= this.makeClient());
  }

  async findUser(discordId: string) {
    const r = check(await this.sb.from("users").select(USER_COLS).eq("discord_id", discordId).maybeSingle(), "findUser") as Row | null;
    return r ? toBotUser(r) : null;
  }

  async getUserById(uid: string) {
    const r = check(await this.sb.from("users").select(USER_COLS).eq("id", uid).maybeSingle(), "getUserById") as Row | null;
    return r ? toBotUser(r) : null;
  }

  async setAnnounce(uid: string, channelId: string | null, on: boolean) {
    const row: Row = { announce_prs: on };
    if (channelId) row.announce_channel_id = channelId;
    check(await this.sb.from("users").update(row).eq("id", uid), "setAnnounce");
  }

  async claimAnnouncement(uid: string, setId: string) {
    const rows = check(
      await this.sb.from("sets").update({ announced_at: new Date().toISOString() }).eq("user_id", uid).eq("id", setId).is("announced_at", null).select("id"),
      "claimAnnouncement",
    );
    return rows.length > 0;
  }

  async dueReminders(now: Date, windowMinutes: number): Promise<DueReminder[]> {
    const rows = check(await this.sb.rpc("due_reminders", { p_now: now.toISOString(), p_window: `${windowMinutes} minutes` }), "dueReminders") as Row[];
    return rows.map((r) => ({ reminderId: r.reminder_id, userId: r.user_id, discordId: r.discord_id, localDate: r.local_date, snoozed: r.snoozed }));
  }

  async markReminderSent(reminderId: string, localDate: string) {
    check(await this.sb.from("reminders").update({ last_sent_on: localDate, snoozed_until: null, last_error: null }).eq("id", reminderId), "markReminderSent");
  }

  async markReminderFailed(reminderId: string, error: string) {
    check(await this.sb.from("reminders").update({ enabled: false, snoozed_until: null, last_error: error }).eq("id", reminderId), "markReminderFailed");
  }

  async listGoals(uid: string): Promise<GoalRow[]> {
    return check(await this.sb.from("goals").select("*").eq("user_id", uid).order("created_at"), "listGoals").map(toGoal);
  }

  async listBodyweight(uid: string) {
    const rows = check(await this.sb.from("bodyweight_entries").select("date, weight").eq("user_id", uid).order("date"), "listBodyweight");
    return rows.map((r: Row) => ({ date: r.date, weightKg: Number(r.weight) }));
  }

  async leaderboard(uid: string, now: Date) {
    const me = check(await this.sb.from("users").select("leaderboard").eq("id", uid).maybeSingle(), "leaderboard/optin") as Row | null;
    if (!me?.leaderboard) return null;
    const rows = check(await this.sb.rpc("leaderboard_for", { p_user: uid, p_now: now.toISOString() }), "leaderboard") as Row[];
    return rows.map((r) => ({
      userId: r.user_id, name: r.nickname || r.display_name, isYou: r.is_you, lifts: r.lifts,
      avgGain: r.avg_gain == null ? null : Number(r.avg_gain), topLift: r.top_lift, topGain: r.top_gain == null ? null : Number(r.top_gain),
    }));
  }

  async setLeaderboard(uid: string, on: boolean) {
    check(await this.sb.from("users").update({ leaderboard: on }).eq("id", uid), "setLeaderboard");
  }

  async logBodyweight(uid: string, date: string, weightKg: number) {
    check(await this.sb.from("bodyweight_entries").upsert({ user_id: uid, date, weight: weightKg }, { onConflict: "user_id,date" }), "logBodyweight");
  }

  async aiUsageToday(uid: string, date: string) {
    const rows = check(await this.sb.rpc("ai_usage_check", { p_user: uid, p_date: date }), "aiUsageToday") as Row[];
    return { user: Number(rows?.[0]?.user_requests ?? 0), global: Number(rows?.[0]?.global_requests ?? 0) };
  }

  async recordAiUsage(uid: string, date: string, tokensIn: number, tokensOut: number) {
    check(await this.sb.rpc("ai_usage_record", { p_user: uid, p_date: date, p_in: Math.round(tokensIn), p_out: Math.round(tokensOut) }), "recordAiUsage");
  }

  async snoozeReminder(uid: string, reminderId: string, until: Date) {
    const rows = check(
      await this.sb.from("reminders").update({ snoozed_until: until.toISOString() }).eq("user_id", uid).eq("id", reminderId).select("id"),
      "snoozeReminder",
    );
    return rows.length > 0;
  }

  async getActiveSplit(uid: string) {
    const r = check(
      await this.sb.from("splits").select("*, split_days(*, split_day_exercises(*))").eq("user_id", uid).eq("is_active", true).maybeSingle(),
      "getActiveSplit",
    ) as Row | null;
    return r ? toSplit(r) : null;
  }

  async getToday(uid: string, now: Date): Promise<Today> {
    const rows = check(await this.sb.rpc("get_today_for", { p_user: uid, p_now: now.toISOString() }), "getToday") as Row[];
    const r = rows?.[0];
    if (!r || r.kind === "no-split") return { kind: "no-split" };
    if (r.kind === "rest") return { kind: "rest" };
    const day = (await this.getActiveSplit(uid))?.days.find((d) => d.id === r.split_day_id);
    return day ? { kind: "day", day } : { kind: "no-split" };
  }

  async listExercises(uid: string) {
    return check(await this.sb.from("exercises").select("*").or(`owner_id.is.null,owner_id.eq.${uid}`).order("name"), "listExercises").map(toExercise);
  }

  async getOpenSession(uid: string) {
    const r = check(
      await this.sb.from("sessions").select("*").eq("user_id", uid).is("finished_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
      "getOpenSession",
    ) as Row | null;
    return r ? toSession(r) : null;
  }

  async startSession(uid: string, splitDayId: string | null, now: Date) {
    const r = check(
      await this.sb.from("sessions").insert({ user_id: uid, split_day_id: splitDayId, started_at: now.toISOString(), source: "discord" }).select().single(),
      "startSession",
    );
    return toSession(r);
  }

  async finishSession(uid: string, sessionId: string, now: Date) {
    check(await this.sb.rpc("finish_session_for", { p_user: uid, p_session_id: sessionId, p_now: now.toISOString() }), "finishSession");
  }

  async setNextPosition(uid: string, position: number) {
    check(await this.sb.rpc("set_next_position_for", { p_user: uid, p_position: position }), "setNextPosition");
  }

  async listSessions(uid: string) {
    return check(await this.sb.from("sessions").select("*").eq("user_id", uid).order("started_at"), "listSessions").map(toSession);
  }

  async listSets(uid: string, filter: { exerciseId?: string; sessionId?: string } = {}) {
    let q = this.sb.from("sets").select("*").eq("user_id", uid).order("created_at");
    if (filter.exerciseId) q = q.eq("exercise_id", filter.exerciseId);
    if (filter.sessionId) q = q.eq("session_id", filter.sessionId);
    return check(await q, "listSets").map(toSet);
  }

  async getSet(uid: string, setId: string) {
    const r = check(await this.sb.from("sets").select("*").eq("user_id", uid).eq("id", setId).maybeSingle(), "getSet") as Row | null;
    return r ? toSet(r) : null;
  }

  async addSet(uid: string, s: NewSet) {
    const r = check(
      await this.sb
        .from("sets")
        .insert({
          user_id: uid, session_id: s.sessionId, exercise_id: s.exerciseId, set_index: s.setIndex, weight: s.weightKg, reps: s.reps,
          rpe: s.rpe, is_warmup: s.isWarmup, note: s.note, created_at: s.createdAt, e1rm: e1rm(s.weightKg, s.reps, this.cfg.prs.formula),
        })
        .select()
        .single(),
      "addSet",
    );
    return toSet(r);
  }

  async deleteSet(uid: string, setId: string) {
    check(await this.sb.from("sets").delete().eq("user_id", uid).eq("id", setId), "deleteSet");
  }

  async savePersonalRecords(uid: string, exerciseId: string, events: PREvent[]) {
    check(await this.sb.from("personal_records").delete().eq("user_id", uid).eq("exercise_id", exerciseId), "savePR/delete");
    if (!events.length) return;
    check(
      await this.sb.from("personal_records").insert(
        events.map((e) => ({
          user_id: uid, exercise_id: e.exerciseId, type: e.type, value: e.value, set_id: e.setId, session_id: e.sessionId,
          weight: e.weightKg, reps: e.reps, baseline: e.baseline, achieved_at: e.achievedAt,
        })),
      ),
      "savePR/insert",
    );
  }

  async friendsToday(uid: string, now: Date): Promise<FriendStatus[]> {
    const rows = check(await this.sb.rpc("friends_today_for", { p_user: uid, p_now: now.toISOString() }), "friendsToday") as Row[];
    return rows.map((r) => ({
      friendId: r.friend_id, displayName: r.display_name, nickname: r.nickname ?? null, kind: r.kind, dayName: r.day_name, setsToday: r.sets_today, lastSessionAt: r.last_session_at,
    }));
  }
}
