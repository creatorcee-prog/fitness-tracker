import type { AppConfig } from "@/config/app.config";
import type { BodyweightEntry } from "@/lib/domain/bodyweight";
import type { Goal } from "@/lib/domain/goals";
import { advance, getToday, type Today } from "@/lib/domain/split";
import type { AccountPrefs, Exercise, FriendProfile, FriendRequest, FriendStatus, NutritionEntry, NutritionTargets, PREvent, Reminder, Profile, ProfileMedia, Session, SetEntry, Split, SplitState } from "@/lib/domain/types";
import { leaderboardRow } from "@/lib/domain/leaderboard";
import { replayPRs } from "@/lib/domain/prs";
import { planImport, type ExportData } from "@/lib/importPlan";
import { libraryExercises, seedSplit } from "./seed";
import type { NewSet, Store } from "./types";

interface DB {
  profile: Profile;
  exercises: Exercise[];
  splits: Split[];
  splitState: SplitState | null;
  sessions: Session[];
  sets: SetEntry[];
  personalRecords: PREvent[];
  /** Friends added by code in local mode (shown alongside config demo friends). */
  localFriends: { id: string; name: string }[];
  removedDemoFriends: string[];
  shareStatus: boolean;
  reminders: Reminder[];
  announcePRs: boolean;
  nicknames: Record<string, string>;
  goals: Goal[];
  nutrition: NutritionEntry[];
  nutritionTargets: NutritionTargets;
  media: ProfileMedia;
  bodyweight: BodyweightEntry[];
  importMemory: Record<string, string>;
  leaderboard: boolean;
}

/** UUIDs everywhere so ids are valid in both backends. */
export function uid(): string {
  return crypto.randomUUID();
}

function freshDb(cfg: AppConfig): DB {
  return {
    profile: {
      id: "local-user",
      displayName: "You",
      unit: cfg.units.default,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
    exercises: libraryExercises().map((e) => ({ ...e, ownerId: null })),
    splits: [{ ...seedSplit(), mode: cfg.split.defaultMode }],
    splitState: null,
    sessions: [],
    sets: [],
    personalRecords: [],
    localFriends: [],
    removedDemoFriends: [],
    shareStatus: true,
    reminders: [],
    announcePRs: false,
    nicknames: {},
    goals: [],
    nutrition: [],
    nutritionTargets: { calories: null, protein: null },
    media: { avatar: null, banner: null },
    bodyweight: [],
    importMemory: {},
    leaderboard: false,
  };
}

/** Browser-only store. All data in one localStorage JSON blob, easy to inspect and edit. */
export class LocalStore implements Store {
  readonly kind = "local" as const;
  private db: DB;

  /** `storage` is injectable so the offline mirror (and tests) can use their own. */
  constructor(private cfg: AppConfig, private storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage) {
    this.db = this.load();
  }

  private load(): DB {
    try {
      const raw = this.storage.getItem(this.cfg.data.localStorageKey);
      if (raw) {
        const db: DB = { ...freshDb(this.cfg), ...JSON.parse(raw) };
        // Older saves have the small starter library: add new library exercises (and synonyms) by name.
        const have = new Map(db.exercises.map((e) => [e.name.toLowerCase(), e]));
        for (const lib of libraryExercises()) {
          const cur = have.get(lib.name.toLowerCase());
          if (!cur) db.exercises.push({ ...lib, ownerId: null });
          else if (cur.ownerId === null && !cur.aliases) cur.aliases = lib.aliases;
        }
        return db;
      }
    } catch {
      /* fall through to a fresh db */
    }
    return freshDb(this.cfg);
  }

  private save() {
    try {
      this.storage.setItem(this.cfg.data.localStorageKey, JSON.stringify(this.db));
    } catch (e) {
      console.error("[local store] save failed", e);
    }
  }

  private log(op: string, ...args: unknown[]) {
    if (this.cfg.debug.logStore) console.debug(`[store:local] ${op}`, ...args);
  }

  private mutate<T>(op: string, fn: (db: DB) => T): T {
    this.db = this.load(); // pick up changes from other tabs
    const out = fn(this.db);
    this.save();
    this.log(op, out);
    return out;
  }

  private read<T>(op: string, fn: (db: DB) => T): T {
    this.db = this.load();
    const out = fn(this.db);
    this.log(op, out);
    return structuredClone(out);
  }

  async getProfile() {
    return this.read("getProfile", (db) => db.profile);
  }

  async updateProfile(patch: Partial<Omit<Profile, "id">>) {
    return this.mutate("updateProfile", (db) => (db.profile = { ...db.profile, ...patch }));
  }

  async getMyMedia() {
    return { ...this.db.media };
  }

  async setMyMedia(patch: Partial<ProfileMedia>) {
    this.mutate("setMyMedia", (db) => (db.media = { ...db.media, ...patch }));
  }

  async listExercises() {
    return this.read("listExercises", (db) => [...db.exercises].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async createExercise(e: Omit<Exercise, "id" | "ownerId">) {
    return this.mutate("createExercise", (db) => {
      const ex: Exercise = { ...e, id: uid(), ownerId: db.profile.id };
      db.exercises.push(ex);
      return ex;
    });
  }

  async updateExercise(id: string, patch: Partial<Omit<Exercise, "id" | "ownerId">>) {
    this.mutate("updateExercise", (db) => {
      db.exercises = db.exercises.map((e) => (e.id === id ? { ...e, ...patch } : e));
    });
  }

  async listSplits() {
    return this.read("listSplits", (db) => db.splits);
  }

  async saveSplit(split: Split) {
    return this.mutate("saveSplit", (db) => {
      const s = structuredClone(split);
      if (s.isActive) db.splits.forEach((x) => (x.isActive = false));
      const i = db.splits.findIndex((x) => x.id === s.id);
      if (i >= 0) db.splits[i] = s;
      else db.splits.push(s);
      return s;
    });
  }

  async deleteSplit(id: string) {
    this.mutate("deleteSplit", (db) => {
      db.splits = db.splits.filter((s) => s.id !== id);
      if (db.splitState?.splitId === id) db.splitState = null;
    });
  }

  async setActiveSplit(id: string) {
    this.mutate("setActiveSplit", (db) => db.splits.forEach((s) => (s.isActive = s.id === id)));
  }

  async getSplitState() {
    return this.read("getSplitState", (db) => db.splitState);
  }

  async getToday(now: Date): Promise<Today> {
    return this.read("getToday", (db) => getToday(db.splits.find((s) => s.isActive) ?? null, db.splitState, now, db.profile.timezone));
  }

  async setNextPosition(position: number) {
    this.mutate("setNextPosition", (db) => {
      const split = db.splits.find((s) => s.isActive);
      if (!split) return;
      db.splitState = { splitId: split.id, nextPosition: position, lastCompletedAt: db.splitState?.lastCompletedAt ?? null };
    });
  }

  async getOpenSession() {
    return this.read("getOpenSession", (db) => db.sessions.find((s) => !s.finishedAt) ?? null);
  }

  async startSession(splitDayId: string | null, now: Date, id?: string) {
    return this.mutate("startSession", (db) => {
      const s: Session = { id: id ?? uid(), splitDayId, startedAt: now.toISOString(), finishedAt: null, source: "web" };
      db.sessions.push(s);
      return s;
    });
  }

  async finishSession(sessionId: string, now: Date) {
    this.mutate("finishSession", (db) => {
      const sess = db.sessions.find((s) => s.id === sessionId);
      if (!sess || sess.finishedAt) return; // idempotent: never double-advance
      sess.finishedAt = now.toISOString();
      const split = db.splits.find((s) => s.isActive);
      const day = split?.days.find((d) => d.id === sess.splitDayId);
      if (split && day && split.mode === "rotation") db.splitState = advance(split, db.splitState, day, now, true);
      else if (split) db.splitState = { splitId: split.id, nextPosition: db.splitState?.nextPosition ?? 0, lastCompletedAt: now.toISOString() };
    });
  }

  async reopenSession(sessionId: string, previousPosition: number | null) {
    this.mutate("reopenSession", (db) => {
      const sess = db.sessions.find((s) => s.id === sessionId);
      if (sess) sess.finishedAt = null;
      if (db.splitState && previousPosition != null) db.splitState.nextPosition = previousPosition;
    });
  }

  async deleteSession(sessionId: string) {
    this.mutate("deleteSession", (db) => {
      db.sessions = db.sessions.filter((s) => s.id !== sessionId);
      db.sets = db.sets.filter((s) => s.sessionId !== sessionId);
    });
  }

  async listSessions() {
    return this.read("listSessions", (db) => [...db.sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)));
  }

  async listSets(filter: { exerciseId?: string; sessionId?: string } = {}) {
    return this.read("listSets", (db) =>
      db.sets
        .filter((s) => (!filter.exerciseId || s.exerciseId === filter.exerciseId) && (!filter.sessionId || s.sessionId === filter.sessionId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }

  async addSet(s: NewSet) {
    return this.mutate("addSet", (db) => {
      const row: SetEntry = { ...s, id: s.id ?? uid(), createdAt: s.createdAt ?? new Date().toISOString() };
      db.sets.push(row);
      return row;
    });
  }

  async updateSet(id: string, patch: Partial<Omit<SetEntry, "id">>) {
    this.mutate("updateSet", (db) => {
      db.sets = db.sets.map((s) => (s.id === id ? { ...s, ...patch } : s));
    });
  }

  async deleteSet(id: string) {
    this.mutate("deleteSet", (db) => {
      db.sets = db.sets.filter((s) => s.id !== id);
    });
  }

  async restoreSet(s: SetEntry) {
    this.mutate("restoreSet", (db) => {
      if (!db.sets.some((x) => x.id === s.id)) db.sets.push(s);
    });
  }

  async savePersonalRecords(exerciseId: string, events: PREvent[]) {
    this.mutate("savePersonalRecords", (db) => {
      db.personalRecords = [...db.personalRecords.filter((p) => p.exerciseId !== exerciseId), ...events];
    });
  }

  // Friends: local mode has no other users, so it shows config.friends.demoFriends
  // plus anyone "added" by code (they always look like a fresh rest-day friend).
  async getFriendCode() {
    return "LOCAL000";
  }

  async sendFriendRequest(code: string) {
    const name = code.trim();
    if (!name) return "not-found";
    if (name.toUpperCase() === "LOCAL000") return "self";
    this.mutate("sendFriendRequest", (db) => db.localFriends.push({ id: `local-${uid()}`, name }));
    return "accepted";
  }

  async listFriendRequests(): Promise<FriendRequest[]> {
    return [];
  }

  async acceptFriendRequest() {}

  async removeFriend(friendId: string) {
    this.mutate("removeFriend", (db) => {
      db.localFriends = db.localFriends.filter((f) => f.id !== friendId);
      if (friendId.startsWith("demo-")) db.removedDemoFriends.push(friendId);
    });
  }

  async friendsToday(): Promise<FriendStatus[]> {
    return this.read("friendsToday", (db) => this.demoFriends(db).map((f) => ({ ...f, nickname: db.nicknames[f.friendId] ?? null })));
  }

  private demoFriends(db: DB): FriendStatus[] {
    return [
      ...this.cfg.friends.demoFriends
        .map((f, i) => ({ id: `demo-${i}`, f }))
        .filter(({ id }) => !db.removedDemoFriends.includes(id))
        .map(({ id, f }): FriendStatus => ({
          friendId: id,
          displayName: f.name,
          kind: f.kind,
          dayName: f.dayName,
          setsToday: f.kind === "hidden" ? null : f.setsToday,
          lastSessionAt: null,
        })),
      ...db.localFriends.map((f): FriendStatus => ({ friendId: f.id, displayName: f.name, kind: "rest", dayName: null, setsToday: 0, lastSessionAt: null })),
    ];
  }

  /** Demo profile built from the demo friend (local mode has no other users). */
  async getFriendProfile(friendId: string, now: Date): Promise<FriendProfile | null> {
    return this.read("getFriendProfile", (db) => {
      const f = this.demoFriends(db).find((x) => x.friendId === friendId);
      if (!f) return null;
      const nickname = db.nicknames[friendId] ?? null;
      if (f.kind === "hidden") return { id: f.friendId, displayName: f.displayName, nickname, shared: false };
      const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
      return {
        id: f.friendId, displayName: f.displayName, nickname, shared: true, unit: "lb",
        today: { kind: f.kind, dayName: f.dayName, setsToday: f.setsToday },
        lastSessionAt: (f.setsToday ?? 0) > 0 ? now.toISOString() : daysAgo(2),
        sessionsThisWeek: (f.setsToday ?? 0) > 0 ? 3 : 2, sessions30d: 12, splitName: "Push / Pull / Legs",
        recentPrs: [
          { exercise: "Bench Press", type: "e1rm", weightKg: 97.5, reps: 5, valueKg: 113.75, achievedAt: daysAgo(2) },
          { exercise: "Back Squat", type: "weight", weightKg: 140, reps: 3, valueKg: 140, achievedAt: daysAgo(6) },
        ],
        topLifts: [{ exercise: "Deadlift", e1rmKg: 190 }, { exercise: "Back Squat", e1rmKg: 152 }, { exercise: "Bench Press", e1rmKg: 113.75 }],
      };
    });
  }

  async setNickname(friendId: string, nickname: string | null) {
    this.mutate("setNickname", (db) => {
      const n = nickname?.trim();
      if (n) db.nicknames[friendId] = n.slice(0, 40);
      else delete db.nicknames[friendId];
    });
  }

  async listNutrition(from: string, to: string) {
    return this.read("listNutrition", (db) => db.nutrition.filter((e) => e.date >= from && e.date <= to).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async addNutrition(e: Omit<NutritionEntry, "id" | "createdAt">) {
    return this.mutate("addNutrition", (db) => {
      const row: NutritionEntry = { ...e, id: uid(), createdAt: new Date().toISOString() };
      db.nutrition.push(row);
      return row;
    });
  }

  async deleteNutrition(id: string) {
    this.mutate("deleteNutrition", (db) => (db.nutrition = db.nutrition.filter((e) => e.id !== id)));
  }

  async getNutritionTargets() {
    return this.read("getNutritionTargets", (db) => db.nutritionTargets);
  }

  async setNutritionTargets(t: NutritionTargets) {
    this.mutate("setNutritionTargets", (db) => (db.nutritionTargets = t));
  }

  async setShareStatus(share: boolean) {
    this.mutate("setShareStatus", (db) => (db.shareStatus = share));
  }

  async getShareStatus() {
    return this.read("getShareStatus", (db) => db.shareStatus);
  }

  async getLeaderboard(now: Date) {
    // Local mode has no real friends: just you, once you've opted in.
    const name = (id: string) => this.db.exercises.find((e) => e.id === id)?.name ?? "?";
    const rows = this.db.leaderboard ? [leaderboardRow({ id: this.db.profile.id, name: this.db.profile.displayName, isYou: true }, this.db.sets, name, now)] : [];
    return { optedIn: this.db.leaderboard, rows };
  }

  async setLeaderboardOptIn(on: boolean) {
    this.mutate("setLeaderboardOptIn", (db) => (db.leaderboard = on));
  }

  async importMemory(keys: string[]) {
    // Local mode has only you: no "most people" hints.
    return { mine: Object.fromEntries(keys.filter((k) => k in this.db.importMemory).map((k) => [k, this.db.importMemory[k]])), popular: {} };
  }

  async rememberImportAnswers(answers: Record<string, string>) {
    this.mutate("rememberImportAnswers", (db) => (db.importMemory = { ...db.importMemory, ...answers }));
  }

  async listBodyweight() {
    return [...this.db.bodyweight].sort((a, b) => a.date.localeCompare(b.date));
  }

  async logBodyweight(e: BodyweightEntry) {
    this.mutate("logBodyweight", (db) => (db.bodyweight = [...db.bodyweight.filter((x) => x.date !== e.date), e]));
  }

  async deleteBodyweight(date: string) {
    this.mutate("deleteBodyweight", (db) => (db.bodyweight = db.bodyweight.filter((x) => x.date !== date)));
  }

  async listGoals() {
    return this.read("listGoals", (db) => [...db.goals].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async saveGoal(g: Goal) {
    return this.mutate("saveGoal", (db) => {
      const i = db.goals.findIndex((x) => x.id === g.id);
      if (i >= 0) db.goals[i] = g;
      else db.goals.push(g);
      return g;
    });
  }

  async deleteGoal(id: string) {
    this.mutate("deleteGoal", (db) => (db.goals = db.goals.filter((g) => g.id !== id)));
  }

  // Reminders and announcements are stored so the Settings UI can be debugged
  // locally, but only the Supabase backend + Discord bot actually send them.
  async listReminders() {
    return this.read("listReminders", (db) => db.reminders);
  }

  async saveReminder(r: Reminder) {
    return this.mutate("saveReminder", (db) => {
      const i = db.reminders.findIndex((x) => x.id === r.id);
      if (i >= 0) db.reminders[i] = r;
      else db.reminders.push(r);
      return r;
    });
  }

  async deleteReminder(id: string) {
    this.mutate("deleteReminder", (db) => (db.reminders = db.reminders.filter((r) => r.id !== id)));
  }

  async sendTestReminder() {
    return { ok: false, message: "Local mode can't send Discord messages. Use the Supabase backend." };
  }

  async getAnnounceSettings() {
    return this.read("getAnnounceSettings", (db) => ({ enabled: db.announcePRs, channelSet: false }));
  }

  async setAnnouncePRs(on: boolean) {
    this.mutate("setAnnouncePRs", (db) => (db.announcePRs = on));
  }

  async announcePRs() {}

  async getPrefs(): Promise<AccountPrefs | null> {
    return null;
  }

  async savePrefs() {}

  subscribe(cb: () => void) {
    const onStorage = (e: StorageEvent) => {
      if (e.key === this.cfg.data.localStorageKey) cb();
    };
    if (typeof window === "undefined") return () => {};
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }

  async exportAll() {
    return this.read("exportAll", (db) => db);
  }

  async importAll(data: unknown) {
    const d = data as ExportData & { merge?: boolean };
    if (!d?.merge) return void this.mutate("importAll", (db) => Object.assign(db, data as DB));
    // Merge (Import old workouts): same rules as the Supabase importer.
    const plan = planImport(d, { exercises: this.db.exercises, sessionStarts: new Set(this.db.sessions.map((x) => new Date(x.startedAt).toISOString())), hasActiveSplit: this.db.splits.some((x) => x.isActive) }, uid);
    this.mutate("importAll", (db) => {
      db.exercises.push(...plan.newExercises.map((e) => ({ ...e, ownerId: db.profile.id })));
      db.splits.push(...plan.splits);
      db.sessions.push(...plan.sessions);
      db.sets.push(...plan.sets);
      db.sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      db.sets.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
    for (const exerciseId of new Set(plan.sets.map((x) => x.exerciseId))) {
      await this.savePersonalRecords(exerciseId, replayPRs(await this.listSets({ exerciseId }), this.db.sessions, this.cfg));
    }
    return { sessions: plan.sessions.length, sets: plan.sets.length, skipped: plan.skippedSessions };
  }

  async resetAll() {
    this.db = freshDb(this.cfg);
    this.save();
  }
}
