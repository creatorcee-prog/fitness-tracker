import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "@/config/app.config";
import { e1rm } from "@/lib/domain/e1rm";
import { replayPRs } from "@/lib/domain/prs";
import type { Today } from "@/lib/domain/split";
import { planImport, type ExportData } from "@/lib/importPlan";
import type { AccountPrefs, Exercise, FriendProfile, FriendRequest, FriendStatus, NutritionEntry, NutritionTargets, PREvent, Reminder, Profile, Session, SetEntry, Split, SplitDay } from "@/lib/domain/types";
import type { NewSet, Store } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export function supabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase backend selected but NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.");
  return createBrowserClient(url, key);
}

/** Throws on error. Data may still be null for maybeSingle(); callers that use it check. */
export function check<T>(res: { data: T; error: { message: string } | null }, op: string): NonNullable<T> {
  if (res.error) throw new Error(`[store:supabase] ${op}: ${res.error.message}`);
  return res.data as NonNullable<T>;
}

export const toExercise = (r: Row): Exercise => ({
  id: r.id, name: r.name, category: r.category, equipment: r.equipment, incrementKg: r.increment_kg == null ? null : Number(r.increment_kg), ownerId: r.owner_id,
});
export const toSession = (r: Row): Session => ({ id: r.id, splitDayId: r.split_day_id, startedAt: r.started_at, finishedAt: r.finished_at, source: r.source });
export const toSet = (r: Row): SetEntry => ({
  id: r.id, sessionId: r.session_id, exerciseId: r.exercise_id, setIndex: r.set_index, weightKg: Number(r.weight), reps: r.reps,
  rpe: r.rpe == null ? null : Number(r.rpe), isWarmup: r.is_warmup, note: r.note, createdAt: r.created_at,
});

/** Row from `splits` selected with `*, split_days(*, split_day_exercises(*))`. */
export const toReminder = (r: Row): Reminder => ({
  id: r.id, channel: r.channel, localTime: String(r.local_time).slice(0, 5), days: r.days ?? [], enabled: r.enabled,
  lastSentOn: r.last_sent_on ?? null, lastError: r.last_error ?? null,
});

export const toSplit = (s: Row): Split => ({
  id: s.id, name: s.name, mode: s.mode, isActive: s.is_active,
  days: (s.split_days ?? []).map((d: Row): SplitDay => ({
    id: d.id, splitId: s.id, position: d.position, name: d.name, weekday: d.weekday,
    exercises: (d.split_day_exercises ?? [])
      .map((x: Row) => ({ exerciseId: x.exercise_id, order: x.order, targetSets: x.target_sets, repRange: x.rep_range }))
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order),
  })),
});

export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  readonly sb: SupabaseClient;

  constructor(private cfg: AppConfig) {
    this.sb = supabaseBrowserClient();
  }

  private log(op: string, ...args: unknown[]) {
    if (this.cfg.debug.logStore) console.debug(`[store:supabase] ${op}`, ...args);
  }

  private async userId(): Promise<string> {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) throw new Error("Not signed in");
    return data.user.id;
  }

  async getProfile(): Promise<Profile> {
    const id = await this.userId();
    const r = check(await this.sb.from("users").select("*").eq("id", id).single(), "getProfile");
    return { id: r.id, displayName: r.display_name, unit: r.unit, timezone: r.timezone };
  }

  async updateProfile(patch: Partial<Omit<Profile, "id">>) {
    const id = await this.userId();
    const row: Row = {};
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    if (patch.unit !== undefined) row.unit = patch.unit;
    if (patch.timezone !== undefined) row.timezone = patch.timezone;
    check(await this.sb.from("users").update(row).eq("id", id), "updateProfile");
    return this.getProfile();
  }

  async listExercises() {
    return check(await this.sb.from("exercises").select("*").order("name"), "listExercises").map(toExercise);
  }

  async createExercise(e: Omit<Exercise, "id" | "ownerId">) {
    const owner_id = await this.userId();
    const r = check(
      await this.sb.from("exercises").insert({ name: e.name, category: e.category, equipment: e.equipment, increment_kg: e.incrementKg, owner_id }).select().single(),
      "createExercise",
    );
    return toExercise(r);
  }

  async updateExercise(id: string, patch: Partial<Omit<Exercise, "id" | "ownerId">>) {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.category !== undefined) row.category = patch.category;
    if (patch.equipment !== undefined) row.equipment = patch.equipment;
    if (patch.incrementKg !== undefined) row.increment_kg = patch.incrementKg;
    check(await this.sb.from("exercises").update(row).eq("id", id), "updateExercise");
  }

  async listSplits(): Promise<Split[]> {
    const rows = check(
      await this.sb.from("splits").select("*, split_days(*, split_day_exercises(*))").order("created_at"),
      "listSplits",
    );
    return rows.map(toSplit);
  }

  /** Not one transaction: fine for a single user editing their own split. */
  async saveSplit(split: Split) {
    this.log("saveSplit", split);
    if (split.isActive) check(await this.sb.from("splits").update({ is_active: false }).neq("id", split.id), "saveSplit/deactivate");
    check(await this.sb.from("splits").upsert({ id: split.id, name: split.name, mode: split.mode, is_active: split.isActive }), "saveSplit/split");

    const keep = split.days.map((d) => d.id);
    const existing = check(await this.sb.from("split_days").select("id").eq("split_id", split.id), "saveSplit/list");
    const remove = existing.map((r: Row) => r.id).filter((id: string) => !keep.includes(id));
    if (remove.length) check(await this.sb.from("split_days").delete().in("id", remove), "saveSplit/delete");

    // Two passes so (split_id, position) never collides while positions are reshuffled.
    if (split.days.length) {
      check(await this.sb.from("split_days").upsert(split.days.map((d, i) => ({ id: d.id, split_id: split.id, position: 10_000 + i, name: d.name, weekday: d.weekday }))), "saveSplit/days1");
      check(await this.sb.from("split_days").upsert(split.days.map((d) => ({ id: d.id, split_id: split.id, position: d.position, name: d.name, weekday: d.weekday }))), "saveSplit/days2");
      check(await this.sb.from("split_day_exercises").delete().in("split_day_id", keep), "saveSplit/exDelete");
      const ex = split.days.flatMap((d) =>
        d.exercises.map((x) => ({ split_day_id: d.id, exercise_id: x.exerciseId, order: x.order, target_sets: x.targetSets, rep_range: x.repRange })),
      );
      if (ex.length) check(await this.sb.from("split_day_exercises").insert(ex), "saveSplit/exInsert");
    }
    return split;
  }

  async deleteSplit(id: string) {
    check(await this.sb.from("splits").delete().eq("id", id), "deleteSplit");
  }

  async setActiveSplit(id: string) {
    check(await this.sb.from("splits").update({ is_active: false }).neq("id", id), "setActiveSplit/off");
    check(await this.sb.from("splits").update({ is_active: true }).eq("id", id), "setActiveSplit/on");
  }

  async getSplitState() {
    const r = check(await this.sb.from("split_state").select("*").maybeSingle(), "getSplitState") as Row | null;
    return r ? { splitId: r.split_id, nextPosition: r.next_position, lastCompletedAt: r.last_completed_at } : null;
  }

  async getToday(now: Date): Promise<Today> {
    const rows = check(await this.sb.rpc("get_today", { p_now: now.toISOString() }), "getToday") as Row[];
    const r = rows?.[0];
    this.log("getToday", r);
    if (!r || r.kind === "no-split") return { kind: "no-split" };
    if (r.kind === "rest") return { kind: "rest" };
    const split = (await this.listSplits()).find((s) => s.isActive);
    const day = split?.days.find((d) => d.id === r.split_day_id);
    return day ? { kind: "day", day } : { kind: "no-split" };
  }

  async setNextPosition(position: number) {
    check(await this.sb.rpc("set_next_position", { p_position: position }), "setNextPosition");
  }

  async getOpenSession() {
    const r = check(await this.sb.from("sessions").select("*").is("finished_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle(), "getOpenSession") as Row | null;
    return r ? toSession(r) : null;
  }

  async startSession(splitDayId: string | null, now: Date, id?: string) {
    const row = { ...(id ? { id } : {}), split_day_id: splitDayId, started_at: now.toISOString(), source: "web" };
    const r = check(await this.sb.from("sessions").insert(row).select().single(), "startSession");
    return toSession(r);
  }

  async finishSession(sessionId: string, now: Date) {
    check(await this.sb.rpc("finish_session", { p_session_id: sessionId, p_now: now.toISOString() }), "finishSession");
  }

  async reopenSession(sessionId: string, previousPosition: number | null) {
    check(await this.sb.from("sessions").update({ finished_at: null }).eq("id", sessionId), "reopenSession");
    if (previousPosition != null) await this.setNextPosition(previousPosition);
  }

  async deleteSession(sessionId: string) {
    check(await this.sb.from("sessions").delete().eq("id", sessionId), "deleteSession");
  }

  async listSessions() {
    return check(await this.sb.from("sessions").select("*").order("started_at"), "listSessions").map(toSession);
  }

  async listSets(filter: { exerciseId?: string; sessionId?: string } = {}) {
    let q = this.sb.from("sets").select("*").order("created_at");
    if (filter.exerciseId) q = q.eq("exercise_id", filter.exerciseId);
    if (filter.sessionId) q = q.eq("session_id", filter.sessionId);
    return check(await q, "listSets").map(toSet);
  }

  private setRow(s: Partial<SetEntry>): Row {
    const row: Row = {};
    if (s.id !== undefined) row.id = s.id;
    if (s.sessionId !== undefined) row.session_id = s.sessionId;
    if (s.exerciseId !== undefined) row.exercise_id = s.exerciseId;
    if (s.setIndex !== undefined) row.set_index = s.setIndex;
    if (s.weightKg !== undefined) row.weight = s.weightKg;
    if (s.reps !== undefined) row.reps = s.reps;
    if (s.rpe !== undefined) row.rpe = s.rpe;
    if (s.isWarmup !== undefined) row.is_warmup = s.isWarmup;
    if (s.note !== undefined) row.note = s.note;
    if (s.createdAt !== undefined) row.created_at = s.createdAt;
    if (s.weightKg !== undefined && s.reps !== undefined) row.e1rm = e1rm(s.weightKg, s.reps, this.cfg.prs.formula);
    return row;
  }

  async addSet(s: NewSet) {
    return toSet(check(await this.sb.from("sets").insert(this.setRow(s)).select().single(), "addSet"));
  }

  async updateSet(id: string, patch: Partial<Omit<SetEntry, "id">>) {
    check(await this.sb.from("sets").update(this.setRow(patch)).eq("id", id), "updateSet");
  }

  async deleteSet(id: string) {
    check(await this.sb.from("sets").delete().eq("id", id), "deleteSet");
  }

  async restoreSet(s: SetEntry) {
    check(await this.sb.from("sets").upsert(this.setRow(s)), "restoreSet");
  }

  async savePersonalRecords(exerciseId: string, events: PREvent[]) {
    check(await this.sb.from("personal_records").delete().eq("exercise_id", exerciseId), "savePR/delete");
    if (!events.length) return;
    check(
      await this.sb.from("personal_records").insert(
        events.map((e) => ({
          exercise_id: e.exerciseId, type: e.type, value: e.value, set_id: e.setId, session_id: e.sessionId,
          weight: e.weightKg, reps: e.reps, baseline: e.baseline, achieved_at: e.achievedAt,
        })),
      ),
      "savePR/insert",
    );
  }

  async getFriendCode() {
    const id = await this.userId();
    return check(await this.sb.from("users").select("friend_code").eq("id", id).single(), "getFriendCode").friend_code as string;
  }

  async sendFriendRequest(code: string) {
    return check(await this.sb.rpc("send_friend_request", { p_code: code }), "sendFriendRequest") as string;
  }

  async listFriendRequests(): Promise<FriendRequest[]> {
    const rows = check(await this.sb.rpc("incoming_friend_requests"), "listFriendRequests") as Row[];
    return rows.map((r) => ({ requesterId: r.requester_id, displayName: r.display_name, createdAt: r.created_at }));
  }

  async acceptFriendRequest(requesterId: string) {
    const me = await this.userId();
    check(await this.sb.from("friendships").update({ status: "accepted" }).eq("requester_id", requesterId).eq("addressee_id", me), "acceptFriendRequest");
  }

  async removeFriend(friendId: string) {
    const me = await this.userId();
    check(
      await this.sb.from("friendships").delete().or(`and(requester_id.eq.${me},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${me})`),
      "removeFriend",
    );
  }

  async friendsToday(now: Date): Promise<FriendStatus[]> {
    const rows = check(await this.sb.rpc("friends_today", { p_now: now.toISOString() }), "friendsToday") as Row[];
    return rows.map((r) => ({
      friendId: r.friend_id, displayName: r.display_name, nickname: r.nickname ?? null, kind: r.kind, dayName: r.day_name,
      setsToday: r.sets_today, lastSessionAt: r.last_session_at,
    }));
  }

  async getFriendProfile(friendId: string, now: Date): Promise<FriendProfile | null> {
    const p = check(await this.sb.rpc("friend_profile", { p_friend: friendId, p_now: now.toISOString() }), "getFriendProfile") as Row | null;
    if (!p) return null;
    if (!p.shared) return { id: p.id, displayName: p.display_name, nickname: p.nickname ?? null, shared: false };
    return {
      id: p.id, displayName: p.display_name, nickname: p.nickname ?? null, shared: true, unit: p.unit,
      today: { kind: p.today?.kind, dayName: p.today?.day_name ?? null, setsToday: p.today?.sets_today ?? null },
      lastSessionAt: p.last_session_at, sessionsThisWeek: Number(p.sessions_this_week ?? 0), sessions30d: Number(p.sessions_30d ?? 0),
      splitName: p.split_name ?? null,
      recentPrs: (p.recent_prs ?? []).map((x: Row) => ({ exercise: x.exercise, type: x.type, weightKg: Number(x.weight), reps: x.reps, valueKg: Number(x.value), achievedAt: x.achieved_at })),
      topLifts: (p.top_lifts ?? []).map((x: Row) => ({ exercise: x.exercise, e1rmKg: Number(x.e1rm) })),
    };
  }

  async setNickname(friendId: string, nickname: string | null) {
    const n = nickname?.trim();
    if (n) check(await this.sb.from("friend_nicknames").upsert({ friend_id: friendId, nickname: n.slice(0, 40) }), "setNickname");
    else check(await this.sb.from("friend_nicknames").delete().eq("friend_id", friendId), "setNickname");
  }

  async listNutrition(from: string, to: string) {
    const rows = check(await this.sb.from("nutrition_entries").select("*").gte("date", from).lte("date", to).order("created_at"), "listNutrition");
    return rows.map((r: Row): NutritionEntry => ({ id: r.id, date: r.date, calories: r.calories, proteinG: r.protein_g == null ? null : Number(r.protein_g), note: r.note, createdAt: r.created_at }));
  }

  async addNutrition(e: Omit<NutritionEntry, "id" | "createdAt">) {
    const r = check(await this.sb.from("nutrition_entries").insert({ date: e.date, calories: e.calories, protein_g: e.proteinG, note: e.note }).select().single(), "addNutrition");
    return { id: r.id, date: r.date, calories: r.calories, proteinG: r.protein_g == null ? null : Number(r.protein_g), note: r.note, createdAt: r.created_at };
  }

  async deleteNutrition(id: string) {
    check(await this.sb.from("nutrition_entries").delete().eq("id", id), "deleteNutrition");
  }

  async getNutritionTargets(): Promise<NutritionTargets> {
    const id = await this.userId();
    const r = check(await this.sb.from("users").select("calorie_target, protein_target").eq("id", id).single(), "getNutritionTargets");
    return { calories: r.calorie_target ?? null, protein: r.protein_target ?? null };
  }

  async setNutritionTargets(t: NutritionTargets) {
    const id = await this.userId();
    check(await this.sb.from("users").update({ calorie_target: t.calories, protein_target: t.protein }).eq("id", id), "setNutritionTargets");
  }

  async setShareStatus(share: boolean) {
    const id = await this.userId();
    check(await this.sb.from("users").update({ share_status: share }).eq("id", id), "setShareStatus");
  }

  async getShareStatus() {
    const id = await this.userId();
    return check(await this.sb.from("users").select("share_status").eq("id", id).single(), "getShareStatus").share_status as boolean;
  }

  async listReminders() {
    return check(await this.sb.from("reminders").select("*").order("local_time"), "listReminders").map(toReminder);
  }

  async saveReminder(r: Reminder) {
    // Saving clears the last error: turning a reminder back on is how you retry after fixing DMs.
    const row = { id: r.id, channel: r.channel, local_time: r.localTime, days: r.days, enabled: r.enabled, last_error: r.enabled ? null : r.lastError };
    return toReminder(check(await this.sb.from("reminders").upsert(row).select().single(), "saveReminder"));
  }

  async deleteReminder(id: string) {
    check(await this.sb.from("reminders").delete().eq("id", id), "deleteReminder");
  }

  async getAnnounceSettings() {
    const id = await this.userId();
    const r = check(await this.sb.from("users").select("announce_prs, announce_channel_id").eq("id", id).single(), "getAnnounceSettings");
    return { enabled: !!r.announce_prs, channelSet: !!r.announce_channel_id };
  }

  async setAnnouncePRs(on: boolean) {
    const id = await this.userId();
    check(await this.sb.from("users").update({ announce_prs: on }).eq("id", id), "setAnnouncePRs");
  }

  async announcePRs(setId: string) {
    const { data } = await this.sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    // Fire and forget: the server re-checks the PR itself, so the client can't fake one.
    await fetch("/api/announce", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ setId }) }).catch(() => {});
  }

  async getPrefs(): Promise<AccountPrefs | null> {
    const id = await this.userId();
    return (check(await this.sb.from("users").select("prefs").eq("id", id).single(), "getPrefs").prefs ?? {}) as AccountPrefs;
  }

  async savePrefs(prefs: AccountPrefs) {
    const id = await this.userId();
    check(await this.sb.from("users").update({ prefs }).eq("id", id), "savePrefs");
  }

  subscribe(cb: () => void) {
    const ch = this.sb
      .channel("split_state")
      .on("postgres_changes", { event: "*", schema: "public", table: "split_state" }, () => cb())
      .subscribe();
    return () => {
      void this.sb.removeChannel(ch);
    };
  }

  async exportAll() {
    const [profile, exercises, splits, splitState, sessions, sets] = await Promise.all([
      this.getProfile(), this.listExercises(), this.listSplits(), this.getSplitState(), this.listSessions(), this.listSets(),
    ]);
    return { profile, exercises: exercises.filter((e) => e.ownerId), splits, splitState, sessions, sets };
  }

  /** Import an export (e.g. from local mode). Safe to repeat: sessions already present are skipped. */
  async importAll(raw: unknown) {
    const data = raw as ExportData;
    if (!data || !Array.isArray(data.sessions) || !Array.isArray(data.sets)) throw new Error(`That file doesn't look like a ${this.cfg.brand.appName} export.`);
    const owner_id = await this.userId();
    const [exercises, sessions, splits] = await Promise.all([this.listExercises(), this.listSessions(), this.listSplits()]);
    const plan = planImport(
      data,
      { exercises, sessionStarts: new Set(sessions.map((x) => new Date(x.startedAt).toISOString())), hasActiveSplit: splits.some((x) => x.isActive) },
      () => crypto.randomUUID(),
    );
    if (plan.newExercises.length) {
      check(await this.sb.from("exercises").insert(plan.newExercises.map((e) => ({ id: e.id, name: e.name, category: e.category, equipment: e.equipment, increment_kg: e.incrementKg, owner_id }))), "import/exercises");
    }
    for (const sp of plan.splits) await this.saveSplit(sp);
    if (plan.sessions.length) {
      check(await this.sb.from("sessions").insert(plan.sessions.map((x) => ({ id: x.id, split_day_id: x.splitDayId, started_at: x.startedAt, finished_at: x.finishedAt, source: x.source }))), "import/sessions");
    }
    for (let i = 0; i < plan.sets.length; i += 500) {
      check(await this.sb.from("sets").insert(plan.sets.slice(i, i + 500).map((x) => this.setRow(x))), "import/sets");
    }
    // Rebuild PRs for every lift that got new sets.
    const allSessions = await this.listSessions();
    for (const exerciseId of new Set(plan.sets.map((x) => x.exerciseId))) {
      await this.savePersonalRecords(exerciseId, replayPRs(await this.listSets({ exerciseId }), allSessions, this.cfg));
    }
    return { sessions: plan.sessions.length, sets: plan.sets.length, skipped: plan.skippedSessions };
  }

  async resetAll() {
    // Deleting sessions cascades to sets and PRs; splits cascade to days and state.
    const id = await this.userId();
    check(await this.sb.from("sessions").delete().eq("user_id", id), "reset/sessions");
    check(await this.sb.from("splits").delete().eq("user_id", id), "reset/splits");
    check(await this.sb.from("exercises").delete().eq("owner_id", id), "reset/exercises");
  }
}
