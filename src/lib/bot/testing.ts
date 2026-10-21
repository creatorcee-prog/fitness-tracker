// Test helper (not used by the app): an in-memory BotData.
import { advance, getToday } from "@/lib/domain/split";
import type { Exercise, FriendStatus, PREvent, Session, SetEntry, Split, SplitState } from "@/lib/domain/types";
import { seedSplit, SEED_EXERCISES } from "@/lib/store/seed";
import type { NewSet } from "@/lib/store/types";
import type { BotData, BotUser, DueReminder, GoalRow } from "./data";

/** In-memory BotData that follows the same rules as the SQL functions. */
export class FakeData implements BotData {
  users: (BotUser & { discordId: string })[] = [{ id: "u1", discordId: "d1", displayName: "Cee", unit: "lb", timezone: "UTC", announceChannelId: null, announcePrs: false }];
  reminders: (DueReminder & { sentOn: string | null; enabled: boolean; error: string | null; snoozedUntil: Date | null })[] = [];
  announced = new Set<string>();
  exercises: Exercise[] = SEED_EXERCISES.map((e) => ({ ...e, ownerId: null }));
  split: Split | null = seedSplit();
  state: SplitState | null = null;
  sessions: Session[] = [];
  sets: SetEntry[] = [];
  prs: PREvent[] = [];
  friends: FriendStatus[] = [];
  n = 0;

  async findUser(discordId: string) {
    return this.users.find((u) => u.discordId === discordId) ?? null;
  }
  async getToday(_uid: string, now: Date) {
    return getToday(this.split, this.state, now, "UTC");
  }
  async getActiveSplit() {
    return this.split;
  }
  async listExercises() {
    return this.exercises;
  }
  async getOpenSession() {
    return this.sessions.find((s) => !s.finishedAt) ?? null;
  }
  async startSession(_uid: string, splitDayId: string | null, now: Date) {
    const s: Session = { id: `sess${++this.n}`, splitDayId, startedAt: now.toISOString(), finishedAt: null, source: "discord" };
    this.sessions.push(s);
    return s;
  }
  async finishSession(_uid: string, id: string, now: Date) {
    const s = this.sessions.find((x) => x.id === id && !x.finishedAt);
    if (!s) return;
    s.finishedAt = now.toISOString();
    const day = this.split?.days.find((d) => d.id === s.splitDayId);
    if (this.split && day && this.split.mode === "rotation") this.state = advance(this.split, this.state, day, now, true);
  }
  async setNextPosition(_uid: string, position: number) {
    this.state = { splitId: this.split!.id, nextPosition: position, lastCompletedAt: this.state?.lastCompletedAt ?? null };
  }
  async listSessions() {
    return this.sessions;
  }
  async listSets(_uid: string, f: { exerciseId?: string; sessionId?: string } = {}) {
    return this.sets.filter((s) => (!f.exerciseId || s.exerciseId === f.exerciseId) && (!f.sessionId || s.sessionId === f.sessionId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async getSet(_uid: string, id: string) {
    return this.sets.find((s) => s.id === id) ?? null;
  }
  async addSet(_uid: string, s: NewSet) {
    const row = { ...s, id: `set${++this.n}`, createdAt: s.createdAt ?? new Date().toISOString() };
    this.sets.push(row);
    return row;
  }
  async deleteSet(_uid: string, id: string) {
    this.sets = this.sets.filter((s) => s.id !== id);
  }
  async savePersonalRecords(_uid: string, exerciseId: string, events: PREvent[]) {
    this.prs = [...this.prs.filter((p) => p.exerciseId !== exerciseId), ...events];
  }
  async friendsToday() {
    return this.friends;
  }
  async getUserById(uid: string) {
    return this.users.find((u) => u.id === uid) ?? null;
  }
  async setAnnounce(uid: string, channelId: string | null, on: boolean) {
    const u = this.users.find((x) => x.id === uid)!;
    if (channelId) u.announceChannelId = channelId;
    u.announcePrs = on;
  }
  async claimAnnouncement(_uid: string, setId: string) {
    if (this.announced.has(setId)) return false;
    this.announced.add(setId);
    return true;
  }
  async dueReminders() {
    return this.reminders.filter((r) => r.enabled && !r.sentOn);
  }
  async markReminderSent(id: string, localDate: string) {
    const r = this.reminders.find((x) => x.reminderId === id)!;
    r.sentOn = localDate;
  }
  async markReminderFailed(id: string, error: string) {
    const r = this.reminders.find((x) => x.reminderId === id)!;
    r.enabled = false;
    r.error = error;
  }
  goals: GoalRow[] = [];
  bodyweight: { date: string; weightKg: number }[] = [];
  aiUsage = new Map<string, { requests: number; tin: number; tout: number }>();
  async listGoals() {
    return this.goals;
  }
  async listBodyweight() {
    return this.bodyweight;
  }
  async aiUsageToday(uid: string, date: string) {
    let global = 0;
    for (const [k, v] of this.aiUsage) if (k.endsWith(`:${date}`)) global += v.requests;
    return { user: this.aiUsage.get(`${uid}:${date}`)?.requests ?? 0, global };
  }
  async recordAiUsage(uid: string, date: string, tin: number, tout: number) {
    const k = `${uid}:${date}`;
    const cur = this.aiUsage.get(k) ?? { requests: 0, tin: 0, tout: 0 };
    this.aiUsage.set(k, { requests: cur.requests + 1, tin: cur.tin + tin, tout: cur.tout + tout });
  }
  async snoozeReminder(_uid: string, id: string, until: Date) {
    const r = this.reminders.find((x) => x.reminderId === id);
    if (!r) return false;
    r.snoozedUntil = until;
    return true;
  }
}

