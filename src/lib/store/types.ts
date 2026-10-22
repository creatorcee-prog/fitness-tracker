import type { BodyweightEntry } from "@/lib/domain/bodyweight";
import type { LeaderboardRow } from "@/lib/domain/leaderboard";
import type { Goal } from "@/lib/domain/goals";
import type { Today } from "@/lib/domain/split";
import type { AccountPrefs, AnnounceSettings, Exercise, FriendProfile, FriendRequest, FriendStatus, NutritionEntry, NutritionTargets, PREvent, Reminder, Profile, ProfileMedia, Session, SetEntry, Split, SplitState } from "@/lib/domain/types";

/** A set to insert. Pass `id` to choose it (offline sync replays inserts with the same id). */
export type NewSet = Omit<SetEntry, "id" | "createdAt"> & { id?: string; createdAt?: string };

/**
 * Everything the UI needs from persistence. Two implementations:
 * LocalStore (browser storage, zero setup) and SupabaseStore (hosted Postgres).
 * Swap with config.data.backend.
 */
export interface Store {
  readonly kind: "local" | "supabase";

  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Omit<Profile, "id">>): Promise<Profile>;

  /** Your profile photo and banner (visible to you and accepted friends). */
  getMyMedia(): Promise<ProfileMedia>;
  /** Set or clear (null) the photo and/or banner. */
  setMyMedia(patch: Partial<ProfileMedia>): Promise<void>;

  listExercises(): Promise<Exercise[]>;
  createExercise(e: Omit<Exercise, "id" | "ownerId">): Promise<Exercise>;
  updateExercise(id: string, patch: Partial<Omit<Exercise, "id" | "ownerId">>): Promise<void>;

  listSplits(): Promise<Split[]>;
  saveSplit(split: Split): Promise<Split>;
  deleteSplit(id: string): Promise<void>;
  setActiveSplit(id: string): Promise<void>;

  getSplitState(): Promise<SplitState | null>;
  /** Server-decided "today" (Supabase calls the get_today() SQL function). */
  getToday(now: Date): Promise<Today>;
  /** Move the pointer without logging (skip), or to a chosen day (swap). */
  setNextPosition(position: number): Promise<void>;

  getOpenSession(): Promise<Session | null>;
  /** `id` is optional so offline sync can replay the insert with the same id. */
  startSession(splitDayId: string | null, now: Date, id?: string): Promise<Session>;
  /** Finishes the session AND advances the split in one step. */
  finishSession(sessionId: string, now: Date): Promise<void>;
  /** Undo for finishSession: clears finished_at and puts the split pointer back. */
  reopenSession(sessionId: string, previousPosition: number | null): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  listSessions(): Promise<Session[]>;

  listSets(filter?: { exerciseId?: string; sessionId?: string }): Promise<SetEntry[]>;
  addSet(s: NewSet): Promise<SetEntry>;
  updateSet(id: string, patch: Partial<Omit<SetEntry, "id">>): Promise<void>;
  deleteSet(id: string): Promise<void>;
  /** Re-insert a deleted set unchanged (undo). */
  restoreSet(s: SetEntry): Promise<void>;

  /** Persist the current PR events for one exercise (derived by replay). */
  savePersonalRecords(exerciseId: string, events: PREvent[]): Promise<void>;

  /** Friend code others type to add you. */
  getFriendCode(): Promise<string>;
  /** Result: "sent" | "accepted" | "not-found" | "self". */
  sendFriendRequest(code: string): Promise<string>;
  listFriendRequests(): Promise<FriendRequest[]>;
  acceptFriendRequest(requesterId: string): Promise<void>;
  removeFriend(friendId: string): Promise<void>;
  /** Each accepted friend's split day today and whether they've lifted. */
  friendsToday(now: Date): Promise<FriendStatus[]>;
  setShareStatus(share: boolean): Promise<void>;
  /** A friend's profile (null if not an accepted friend). */
  getFriendProfile(friendId: string, now: Date): Promise<FriendProfile | null>;
  /** Your private label for a friend; null/empty clears it. */
  setNickname(friendId: string, nickname: string | null): Promise<void>;

  /**
   * Learning synonyms: "when I typed X I meant this lift". Used for you right
   * away (listExercises includes it in the lift's aliases) and, for library
   * lifts, for everyone once 3+ people agree.
   */
  voteAlias(typed: string, exerciseId: string): Promise<void>;
  /** A name that matched nothing (counts only, for the owner's synonym review). */
  recordNameMiss(name: string): Promise<void>;

  /** Friends leaderboard (% strength gain), opt-in: you and opted-in friends. */
  getLeaderboard(now: Date): Promise<{ optedIn: boolean; rows: LeaderboardRow[] }>;
  setLeaderboardOptIn(on: boolean): Promise<void>;

  /** Calorie intake, by local date (YYYY-MM-DD), inclusive range. */
  listNutrition(from: string, to: string): Promise<NutritionEntry[]>;
  addNutrition(e: Omit<NutritionEntry, "id" | "createdAt">): Promise<NutritionEntry>;
  deleteNutrition(id: string): Promise<void>;
  getNutritionTargets(): Promise<NutritionTargets>;
  setNutritionTargets(t: NutritionTargets): Promise<void>;
  getShareStatus(): Promise<boolean>;

  /** Import questions: your earlier answers, plus the most common answer across users (only when 3+ people gave it). */
  importMemory(keys: string[]): Promise<{ mine: Record<string, string>; popular: Record<string, { value: string; users: number }> }>;
  /** Remember import answers for next time (and, anonymously aggregated, as hints for others). */
  rememberImportAnswers(answers: Record<string, string>): Promise<void>;

  /** Bodyweight, one entry per local date (kg), oldest first. */
  listBodyweight(): Promise<BodyweightEntry[]>;
  /** Log (or replace) the weight for a date. */
  logBodyweight(e: BodyweightEntry): Promise<void>;
  deleteBodyweight(date: string): Promise<void>;

  /** Goals (progress is computed from sets, never stored). */
  listGoals(): Promise<Goal[]>;
  saveGoal(g: Goal): Promise<Goal>;
  deleteGoal(id: string): Promise<void>;

  /** Discord reminders / daily check-in (sent only on the Supabase backend). */
  listReminders(): Promise<Reminder[]>;
  saveReminder(r: Reminder): Promise<Reminder>;
  deleteReminder(id: string): Promise<void>;
  /** DM a check-in right now, ignoring skip rules (Settings → Send test reminder). */
  sendTestReminder(reminderId?: string): Promise<{ ok: boolean; message: string }>;

  /** Opt-in PR announcements in the Discord channel chosen with /announce on. */
  getAnnounceSettings(): Promise<AnnounceSettings>;
  setAnnouncePRs(on: boolean): Promise<void>;
  /** Ask the server to announce any PRs this set earned (no-op when off or local). */
  announcePRs(setId: string): Promise<void>;

  /** Theme and dashboard saved to the account (null on the local backend). */
  getPrefs(): Promise<AccountPrefs | null>;
  savePrefs(prefs: AccountPrefs): Promise<void>;

  /** Called when data changes elsewhere (other tab, Realtime). Returns unsubscribe. */
  subscribe(cb: () => void): () => void;

  exportAll(): Promise<unknown>;
  /** Returns counts when the backend reports them (Supabase). */
  importAll(data: unknown): Promise<void | { sessions: number; sets: number; skipped: number }>;
  resetAll(): Promise<void>;
}
