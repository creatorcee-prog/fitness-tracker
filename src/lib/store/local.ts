import type { AppConfig } from "@/config/app.config";
import { advance, getToday, type Today } from "@/lib/domain/split";
import type { Exercise, FriendRequest, FriendStatus, PREvent, Profile, Session, SetEntry, Split, SplitState } from "@/lib/domain/types";
import { SEED_EXERCISES, seedSplit } from "./seed";
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
    exercises: SEED_EXERCISES.map((e) => ({ ...e, ownerId: null })),
    splits: [{ ...seedSplit(), mode: cfg.split.defaultMode }],
    splitState: null,
    sessions: [],
    sets: [],
    personalRecords: [],
    localFriends: [],
    removedDemoFriends: [],
    shareStatus: true,
  };
}

/** Browser-only store. All data in one localStorage JSON blob, easy to inspect and edit. */
export class LocalStore implements Store {
  readonly kind = "local" as const;
  private db: DB;

  constructor(private cfg: AppConfig) {
    this.db = this.load();
  }

  private load(): DB {
    try {
      const raw = window.localStorage.getItem(this.cfg.data.localStorageKey);
      if (raw) return { ...freshDb(this.cfg), ...JSON.parse(raw) };
    } catch {
      /* fall through to a fresh db */
    }
    return freshDb(this.cfg);
  }

  private save() {
    try {
      window.localStorage.setItem(this.cfg.data.localStorageKey, JSON.stringify(this.db));
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

  async startSession(splitDayId: string | null, now: Date) {
    return this.mutate("startSession", (db) => {
      const s: Session = { id: uid(), splitDayId, startedAt: now.toISOString(), finishedAt: null, source: "web" };
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
      const row: SetEntry = { ...s, id: uid(), createdAt: s.createdAt ?? new Date().toISOString() };
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
    return this.read("friendsToday", (db) => [
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
    ]);
  }

  async setShareStatus(share: boolean) {
    this.mutate("setShareStatus", (db) => (db.shareStatus = share));
  }

  async getShareStatus() {
    return this.read("getShareStatus", (db) => db.shareStatus);
  }

  subscribe(cb: () => void) {
    const onStorage = (e: StorageEvent) => {
      if (e.key === this.cfg.data.localStorageKey) cb();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }

  async exportAll() {
    return this.read("exportAll", (db) => db);
  }

  async importAll(data: unknown) {
    this.mutate("importAll", (db) => Object.assign(db, data as DB));
  }

  async resetAll() {
    this.db = freshDb(this.cfg);
    this.save();
  }
}
