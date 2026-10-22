import type { AppConfig } from "@/config/app.config";
import type { Goal } from "@/lib/domain/goals";
import type { Today } from "@/lib/domain/split";
import type { AccountPrefs, Exercise, NutritionEntry, NutritionTargets, PREvent, Profile, ProfileMedia, Reminder, SetEntry, Split } from "@/lib/domain/types";
import { LocalStore, uid } from "./local";
import type { NewSet, Store } from "./types";

/**
 * Offline logging.
 *
 * Online, every call goes straight to the remote store (Supabase), exactly as
 * without this wrapper, and workout writes are also copied into a per-user
 * mirror in localStorage. When the network fails, workout reads come from the
 * mirror and workout writes go to the mirror plus an outbox. The outbox is
 * replayed in order once the connection is back. Replays are idempotent
 * (client-chosen ids, duplicate inserts ignored), so a half-finished flush is
 * safe to repeat. Anything that isn't part of logging a workout (editing
 * splits, friends, reminders) needs a connection and says so.
 */

export type Op =
  | { op: "startSession"; id: string; splitDayId: string | null; now: string }
  | { op: "addSet"; set: NewSet & { id: string; createdAt: string } }
  | { op: "updateSet"; id: string; patch: Partial<Omit<SetEntry, "id">> }
  | { op: "deleteSet"; id: string }
  | { op: "restoreSet"; set: SetEntry }
  | { op: "finishSession"; id: string; now: string }
  | { op: "reopenSession"; id: string; previousPosition: number | null }
  | { op: "deleteSession"; id: string }
  | { op: "setNextPosition"; position: number }
  | { op: "savePersonalRecords"; exerciseId: string; events: PREvent[] };

export interface SyncStatus {
  /** False after a request failed for lack of network (until one succeeds again). */
  online: boolean;
  /** Changes saved on this device that haven't reached the server yet. */
  pending: number;
  pendingSets: number;
  /** Changes the server rejected for a reason other than the network (dropped). */
  errors: string[];
}

export class OfflineError extends Error {
  constructor(message = "You're offline. This needs a connection; your workout logging still works.") {
    super(message);
  }
}

export function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|offline/i.test(msg) || e instanceof OfflineError;
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

export class SyncStore implements Store {
  readonly kind = "supabase" as const;
  private mirror: LocalStore | null = null;
  private userId: string | null = null;
  private outbox: Op[] = [];
  private online = true;
  private errors: string[] = [];
  private listeners = new Set<() => void>();
  private flushing: Promise<void> | null = null;
  private initing: Promise<void> | null = null;
  private pulledThisVisit = false;

  constructor(
    private cfg: AppConfig,
    readonly remote: Store,
    private getUserId: () => Promise<string | null>,
    private storage: Storage = window.localStorage,
    /** While offline, try to reconnect this often (ms). 0 = only on the browser's "online" event. */
    retryMs = 20_000,
  ) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) this.online = false;
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("online", () => {
        this.online = true;
        void this.sync().catch(() => {});
      });
      window.addEventListener("offline", () => this.setOnline(false));
      if (retryMs > 0) setInterval(() => !this.online && void this.sync().catch(() => {}), retryMs);
    }
  }

  // ---------------------------------------------------------------- plumbing

  private key(name: string) {
    return `ft:${name}:${this.userId}`;
  }

  private ready(): Promise<void> {
    return (this.initing ??= (async () => {
      this.userId = await this.getUserId();
      if (!this.userId) throw new Error("Not signed in");
      this.mirror = new LocalStore({ ...this.cfg, data: { ...this.cfg.data, localStorageKey: this.key("mirror") } }, this.storage);
      try {
        this.outbox = JSON.parse(this.storage.getItem(this.key("outbox")) ?? "[]");
      } catch {
        this.outbox = [];
      }
    })().catch((e) => {
      this.initing = null;
      throw e;
    }));
  }

  private get mirrorReady() {
    return this.storage.getItem(this.key("mirror-ready")) === "1";
  }

  private saveOutbox() {
    this.storage.setItem(this.key("outbox"), JSON.stringify(this.outbox));
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private setOnline(v: boolean) {
    if (this.online === v) return;
    this.online = v;
    this.notify();
  }

  status(): SyncStatus {
    return {
      online: this.online,
      pending: this.outbox.length,
      pendingSets: this.outbox.filter((o) => o.op === "addSet").length,
      errors: [...this.errors],
    };
  }

  /** Copy the server's current workout data into the mirror. */
  private async pull() {
    const [profile, exercises, splits, splitState, sessions, sets] = await Promise.all([
      this.remote.getProfile(), this.remote.listExercises(), this.remote.listSplits(), this.remote.getSplitState(), this.remote.listSessions(), this.remote.listSets(),
    ]);
    await this.mirror!.importAll({ profile, exercises, splits, splitState, sessions, sets, personalRecords: [] });
    this.storage.setItem(this.key("mirror-ready"), "1");
    this.pulledThisVisit = true;
  }

  private runRemote(o: Op): Promise<unknown> {
    const r = this.remote;
    switch (o.op) {
      case "startSession": return r.startSession(o.splitDayId, new Date(o.now), o.id);
      case "addSet": return r.addSet(o.set);
      case "updateSet": return r.updateSet(o.id, o.patch);
      case "deleteSet": return r.deleteSet(o.id);
      case "restoreSet": return r.restoreSet(o.set);
      case "finishSession": return r.finishSession(o.id, new Date(o.now));
      case "reopenSession": return r.reopenSession(o.id, o.previousPosition);
      case "deleteSession": return r.deleteSession(o.id);
      case "setNextPosition": return r.setNextPosition(o.position);
      case "savePersonalRecords": return r.savePersonalRecords(o.exerciseId, o.events);
    }
  }

  /** Replay the outbox in order. Network failure stops (and keeps the rest); other failures are dropped and reported. */
  private flush(): Promise<void> {
    if (!this.outbox.length) return Promise.resolve();
    return (this.flushing ??= (async () => {
      while (this.outbox.length) {
        const op = this.outbox[0];
        try {
          await this.runRemote(op);
        } catch (e) {
          if (isNetworkError(e)) {
            this.setOnline(false);
            throw e;
          }
          const msg = e instanceof Error ? e.message : String(e);
          if (!/duplicate key|already exists|23505/i.test(msg)) this.errors.push(`${op.op}: ${msg}`);
        }
        this.outbox.shift();
        this.saveOutbox();
        this.notify();
      }
      this.setOnline(true);
      await this.pull();
      this.notify();
    })().finally(() => {
      this.flushing = null;
    }));
  }

  /** Try to get back in sync (called on the browser's "online" event and periodically). */
  async sync(): Promise<void> {
    await this.ready();
    try {
      await this.flush();
      // Probe the server even when there was nothing to send.
      if (!this.pulledThisVisit) await this.pull();
      else await this.remote.getSplitState();
      this.setOnline(true);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      this.setOnline(false);
    }
  }

  private requireMirror(): LocalStore {
    if (!this.mirrorReady || !this.mirror) throw new OfflineError("You're offline and this device hasn't synced yet. Connect once and offline logging will work from then on.");
    return this.mirror;
  }

  /** Workout read: remote when possible, mirror when offline. */
  private async read<T>(remoteFn: () => Promise<T>, mirrorFn: (m: LocalStore) => Promise<T>): Promise<T> {
    await this.ready();
    if (this.online) {
      try {
        await this.flush();
        const out = await remoteFn();
        if (!this.pulledThisVisit) void this.pull().catch(() => {});
        return out;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        this.setOnline(false);
      }
    }
    return mirrorFn(this.requireMirror());
  }

  /** Workout write: remote (+ mirror copy) when possible, otherwise mirror + outbox. */
  private async write<T>(op: Op, remoteFn: () => Promise<T>, mirrorFn: (m: LocalStore) => Promise<T>): Promise<T> {
    await this.ready();
    if (this.online) {
      try {
        await this.flush();
        const out = await remoteFn();
        if (this.mirrorReady) await mirrorFn(this.mirror!).catch(() => {});
        return out;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        this.setOnline(false);
      }
    }
    const out = await mirrorFn(this.requireMirror());
    this.outbox.push(op);
    this.saveOutbox();
    this.notify();
    return out;
  }

  /** Needs the server; fails with a friendly message offline. */
  private async online_<T>(fn: () => Promise<T>): Promise<T> {
    await this.ready();
    try {
      await this.flush();
      return await fn();
    } catch (e) {
      if (isNetworkError(e)) {
        this.setOnline(false);
        throw new OfflineError();
      }
      throw e;
    }
  }

  // ---------------------------------------------------------------- reads

  getProfile(): Promise<Profile> {
    return this.read(() => this.remote.getProfile(), (m) => m.getProfile());
  }
  listExercises() {
    return this.read(() => this.remote.listExercises(), (m) => m.listExercises());
  }
  listSplits() {
    return this.read(() => this.remote.listSplits(), (m) => m.listSplits());
  }
  getSplitState() {
    return this.read(() => this.remote.getSplitState(), (m) => m.getSplitState());
  }
  getToday(now: Date): Promise<Today> {
    return this.read(() => this.remote.getToday(now), (m) => m.getToday(now));
  }
  getOpenSession() {
    return this.read(() => this.remote.getOpenSession(), (m) => m.getOpenSession());
  }
  listSessions() {
    return this.read(() => this.remote.listSessions(), (m) => m.listSessions());
  }
  listSets(filter?: { exerciseId?: string; sessionId?: string }) {
    return this.read(() => this.remote.listSets(filter), (m) => m.listSets(filter));
  }

  // ---------------------------------------------------------------- workout writes (work offline)

  startSession(splitDayId: string | null, now: Date, id = uid()) {
    return this.write(
      { op: "startSession", id, splitDayId, now: now.toISOString() },
      () => this.remote.startSession(splitDayId, now, id),
      (m) => m.startSession(splitDayId, now, id),
    );
  }
  addSet(s: NewSet) {
    const set = { ...s, id: s.id ?? uid(), createdAt: s.createdAt ?? new Date().toISOString() };
    return this.write({ op: "addSet", set }, () => this.remote.addSet(set), (m) => m.addSet(set));
  }
  updateSet(id: string, patch: Partial<Omit<SetEntry, "id">>) {
    return this.write({ op: "updateSet", id, patch }, () => this.remote.updateSet(id, patch), (m) => m.updateSet(id, patch));
  }
  deleteSet(id: string) {
    return this.write({ op: "deleteSet", id }, () => this.remote.deleteSet(id), (m) => m.deleteSet(id));
  }
  restoreSet(set: SetEntry) {
    return this.write({ op: "restoreSet", set }, () => this.remote.restoreSet(set), (m) => m.restoreSet(set));
  }
  finishSession(id: string, now: Date) {
    return this.write({ op: "finishSession", id, now: now.toISOString() }, () => this.remote.finishSession(id, now), (m) => m.finishSession(id, now));
  }
  reopenSession(id: string, previousPosition: number | null) {
    return this.write({ op: "reopenSession", id, previousPosition }, () => this.remote.reopenSession(id, previousPosition), (m) => m.reopenSession(id, previousPosition));
  }
  deleteSession(id: string) {
    return this.write({ op: "deleteSession", id }, () => this.remote.deleteSession(id), (m) => m.deleteSession(id));
  }
  setNextPosition(position: number) {
    return this.write({ op: "setNextPosition", position }, () => this.remote.setNextPosition(position), (m) => m.setNextPosition(position));
  }
  savePersonalRecords(exerciseId: string, events: PREvent[]) {
    return this.write({ op: "savePersonalRecords", exerciseId, events }, () => this.remote.savePersonalRecords(exerciseId, events), (m) => m.savePersonalRecords(exerciseId, events));
  }

  // ---------------------------------------------------------------- everything else (needs a connection)

  async updateProfile(patch: Partial<Omit<Profile, "id">>) {
    const p = await this.online_(() => this.remote.updateProfile(patch));
    if (this.mirrorReady) await this.mirror!.updateProfile(patch);
    return p;
  }
  async createExercise(e: Omit<Exercise, "id" | "ownerId">) {
    const ex = await this.online_(() => this.remote.createExercise(e));
    this.pulledThisVisit = false;
    return ex;
  }
  updateExercise(id: string, patch: Partial<Omit<Exercise, "id" | "ownerId">>) {
    return this.online_(() => this.remote.updateExercise(id, patch));
  }
  async saveSplit(split: Split) {
    const s = await this.online_(() => this.remote.saveSplit(split));
    if (this.mirrorReady) await this.mirror!.saveSplit(s);
    return s;
  }
  async deleteSplit(id: string) {
    await this.online_(() => this.remote.deleteSplit(id));
    if (this.mirrorReady) await this.mirror!.deleteSplit(id);
  }
  async setActiveSplit(id: string) {
    await this.online_(() => this.remote.setActiveSplit(id));
    if (this.mirrorReady) await this.mirror!.setActiveSplit(id);
  }
  getFriendCode() {
    return this.online_(() => this.remote.getFriendCode());
  }
  sendFriendRequest(code: string) {
    return this.online_(() => this.remote.sendFriendRequest(code));
  }
  listFriendRequests() {
    return this.online_(() => this.remote.listFriendRequests());
  }
  acceptFriendRequest(id: string) {
    return this.online_(() => this.remote.acceptFriendRequest(id));
  }
  removeFriend(id: string) {
    return this.online_(() => this.remote.removeFriend(id));
  }
  friendsToday(now: Date) {
    return this.online_(() => this.remote.friendsToday(now));
  }
  setShareStatus(share: boolean) {
    return this.online_(() => this.remote.setShareStatus(share));
  }
  getShareStatus() {
    return this.online_(() => this.remote.getShareStatus());
  }
  voteAlias(typed: string, exerciseId: string) {
    // Mirror it locally too, so it works offline and right away.
    void this.mirror?.voteAlias(typed, exerciseId);
    return this.remote.voteAlias(typed, exerciseId).catch(() => {});
  }
  recordNameMiss(name: string) {
    return this.remote.recordNameMiss(name).catch(() => {});
  }
  claimInvite(code: string) {
    return this.remote.claimInvite(code).catch(() => false);
  }
  recruitCounts(ids: string[]) {
    return this.remote.recruitCounts(ids).catch(() => ({}) as Record<string, number>);
  }
  getLeaderboard(now: Date) {
    return this.online_(() => this.remote.getLeaderboard(now));
  }
  setLeaderboardOptIn(on: boolean) {
    return this.online_(() => this.remote.setLeaderboardOptIn(on));
  }
  importMemory(keys: string[]) {
    return this.remote.importMemory(keys).catch(() => ({ mine: {}, popular: {} }));
  }
  rememberImportAnswers(answers: Record<string, string>) {
    return this.remote.rememberImportAnswers(answers).catch(() => {});
  }
  listBodyweight() {
    return this.online_(() => this.remote.listBodyweight());
  }
  logBodyweight(e: { date: string; weightKg: number }) {
    return this.online_(() => this.remote.logBodyweight(e));
  }
  deleteBodyweight(date: string) {
    return this.online_(() => this.remote.deleteBodyweight(date));
  }
  getMyMedia() {
    return this.online_(() => this.remote.getMyMedia());
  }
  setMyMedia(patch: Partial<ProfileMedia>) {
    return this.online_(() => this.remote.setMyMedia(patch));
  }
  getFriendProfile(friendId: string, now: Date) {
    return this.online_(() => this.remote.getFriendProfile(friendId, now));
  }
  setNickname(friendId: string, nickname: string | null) {
    return this.online_(() => this.remote.setNickname(friendId, nickname));
  }
  listNutrition(from: string, to: string) {
    return this.online_(() => this.remote.listNutrition(from, to));
  }
  addNutrition(e: Omit<NutritionEntry, "id" | "createdAt">) {
    return this.online_(() => this.remote.addNutrition(e));
  }
  deleteNutrition(id: string) {
    return this.online_(() => this.remote.deleteNutrition(id));
  }
  getNutritionTargets() {
    return this.online_(() => this.remote.getNutritionTargets());
  }
  setNutritionTargets(t: NutritionTargets) {
    return this.online_(() => this.remote.setNutritionTargets(t));
  }
  listGoals() {
    return this.online_(() => this.remote.listGoals());
  }
  saveGoal(g: Goal) {
    return this.online_(() => this.remote.saveGoal(g));
  }
  deleteGoal(id: string) {
    return this.online_(() => this.remote.deleteGoal(id));
  }
  listReminders(): Promise<Reminder[]> {
    return this.online_(() => this.remote.listReminders());
  }
  saveReminder(r: Reminder) {
    return this.online_(() => this.remote.saveReminder(r));
  }
  deleteReminder(id: string) {
    return this.online_(() => this.remote.deleteReminder(id));
  }
  sendTestReminder(reminderId?: string) {
    return this.online_(() => this.remote.sendTestReminder(reminderId));
  }
  getAnnounceSettings() {
    return this.online_(() => this.remote.getAnnounceSettings());
  }
  setAnnouncePRs(on: boolean) {
    return this.online_(() => this.remote.setAnnouncePRs(on));
  }
  /** Best effort: a PR set offline isn't announced (the server only announces recent sets). */
  async announcePRs(setId: string) {
    if (this.online) await this.remote.announcePRs(setId).catch(() => {});
  }
  async getPrefs(): Promise<AccountPrefs | null> {
    try {
      return await this.online_(() => this.remote.getPrefs());
    } catch {
      return null;
    }
  }
  async savePrefs(prefs: AccountPrefs) {
    await this.online_(() => this.remote.savePrefs(prefs)).catch(() => {});
  }
  exportAll() {
    return this.read(() => this.remote.exportAll(), (m) => m.exportAll());
  }
  async importAll(data: unknown) {
    const r = await this.online_(() => this.remote.importAll(data));
    this.pulledThisVisit = false;
    return r;
  }
  async resetAll() {
    await this.online_(() => this.remote.resetAll());
    this.storage.removeItem(this.key("mirror-ready"));
    this.pulledThisVisit = false;
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    const unsub = this.remote.subscribe(() => {
      this.pulledThisVisit = false;
      cb();
    });
    return () => {
      this.listeners.delete(cb);
      unsub();
    };
  }
}
