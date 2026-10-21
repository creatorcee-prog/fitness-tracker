import type { Today } from "@/lib/domain/split";
import type { Exercise, FriendRequest, FriendStatus, PREvent, Profile, Session, SetEntry, Split, SplitState } from "@/lib/domain/types";

export type NewSet = Omit<SetEntry, "id" | "createdAt"> & { createdAt?: string };

/**
 * Everything the UI needs from persistence. Two implementations:
 * LocalStore (browser storage, zero setup) and SupabaseStore (hosted Postgres).
 * Swap with config.data.backend.
 */
export interface Store {
  readonly kind: "local" | "supabase";

  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Omit<Profile, "id">>): Promise<Profile>;

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
  startSession(splitDayId: string | null, now: Date): Promise<Session>;
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
  getShareStatus(): Promise<boolean>;

  /** Called when data changes elsewhere (other tab, Realtime). Returns unsubscribe. */
  subscribe(cb: () => void): () => void;

  exportAll(): Promise<unknown>;
  importAll(data: unknown): Promise<void>;
  resetAll(): Promise<void>;
}
