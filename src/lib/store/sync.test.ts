import { beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "@/config/app.config";
import { deepMerge } from "@/config/runtime";
import { LocalStore } from "./local";
import { isNetworkError, OfflineError, SyncStore } from "./sync";
import type { Store } from "./types";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** A "server" (LocalStore) whose every call fails like fetch does when `down` is true. */
function flakyRemote(inner: Store) {
  const state = { down: false, calls: 0 };
  const proxy = new Proxy(inner, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (typeof v !== "function" || prop === "subscribe") return v;
      return async (...args: unknown[]) => {
        state.calls++;
        if (state.down) throw new Error("[store:supabase] op: TypeError: Failed to fetch");
        return v.apply(target, args);
      };
    },
  });
  return { remote: proxy as Store, state };
}

const cfg = deepMerge(defaultConfig, { data: { localStorageKey: "server" } });
let server: LocalStore;
let net: { down: boolean; calls: number };
let sync: SyncStore;
let storage: MemStorage;
const now = new Date("2026-10-21T18:00:00Z");

beforeEach(() => {
  storage = new MemStorage();
  server = new LocalStore(cfg, new MemStorage());
  const f = flakyRemote(server);
  net = f.state;
  sync = new SyncStore(cfg, f.remote, async () => "user-1", storage, 0);
});

const setOf = (sessionId: string, weightKg: number, i = 0) => ({ sessionId, exerciseId: "ex-bench", setIndex: i, weightKg, reps: 5, rpe: null, isWarmup: false, note: null });

describe("SyncStore", () => {
  it("passes straight through when online and keeps a mirror", async () => {
    const t = await sync.getToday(now);
    expect(t).toMatchObject({ kind: "day", day: { name: "Push" } });
    const s = await sync.startSession("split-ppl-d0", now);
    await sync.addSet(setOf(s.id, 100));
    expect(await server.listSets()).toHaveLength(1);
    expect(sync.status()).toMatchObject({ online: true, pending: 0 });
  });

  it("logs a whole workout offline and syncs it in order when back", async () => {
    await sync.listSets(); // first online visit fills the mirror
    await new Promise((r) => setTimeout(r, 0));
    net.down = true;

    const s = await sync.startSession("split-ppl-d0", now);
    await sync.addSet(setOf(s.id, 100, 0));
    const second = await sync.addSet(setOf(s.id, 102.5, 1));
    await sync.deleteSet(second.id);
    await sync.addSet(setOf(s.id, 105, 1));
    expect((await sync.listSets({ sessionId: s.id })).map((x) => x.weightKg)).toEqual([100, 105]); // from the mirror
    await sync.finishSession(s.id, now);
    expect(await sync.getToday(now)).toMatchObject({ day: { name: "Pull" } }); // mirror advanced the split

    expect(sync.status()).toMatchObject({ online: false, pendingSets: 3 });
    expect(await server.listSets()).toHaveLength(0);

    net.down = false;
    await sync.sync();
    expect(sync.status()).toMatchObject({ online: true, pending: 0, errors: [] });
    expect((await server.listSets()).map((x) => x.weightKg)).toEqual([100, 105]);
    expect((await server.listSessions())[0]).toMatchObject({ id: s.id, finishedAt: now.toISOString() });
    expect(await server.getToday(now)).toMatchObject({ day: { name: "Pull" } });
  });

  it("keeps the outbox across reloads", async () => {
    await sync.listSets();
    await new Promise((r) => setTimeout(r, 0));
    net.down = true;
    const s = await sync.startSession(null, now);
    await sync.addSet(setOf(s.id, 80));
    // "Reload": a new SyncStore over the same device storage.
    const f = flakyRemote(server);
    const again = new SyncStore(cfg, f.remote, async () => "user-1", storage, 0);
    await again.sync();
    expect(await server.listSets()).toHaveLength(1);
  });

  it("stops on network failure mid-flush and resumes without duplicates", async () => {
    await sync.listSets();
    await new Promise((r) => setTimeout(r, 0));
    net.down = true;
    const s = await sync.startSession(null, now);
    await sync.addSet(setOf(s.id, 80, 0));
    await sync.addSet(setOf(s.id, 85, 1));
    // Come back long enough for one set, then drop again.
    net.down = false;
    let left = 1;
    const orig = server.addSet.bind(server);
    server.addSet = async (x) => {
      if (--left < 0) throw new Error("TypeError: Failed to fetch");
      return orig(x);
    };
    await sync.sync();
    expect(sync.status().pending).toBe(1);
    server.addSet = orig;
    await sync.sync();
    expect((await server.listSets()).map((x) => x.weightKg)).toEqual([80, 85]);
  });

  it("explains when offline before the first sync", async () => {
    net.down = true;
    await expect(sync.getToday(now)).rejects.toBeInstanceOf(OfflineError);
  });

  it("needs a connection for non-workout changes", async () => {
    await sync.listSets();
    net.down = true;
    await expect(sync.friendsToday(now)).rejects.toThrow("You're offline");
    expect(await sync.getPrefs()).toBeNull();
  });

  it("reports non-network rejections instead of retrying forever", async () => {
    await sync.listSets();
    await new Promise((r) => setTimeout(r, 0));
    net.down = true;
    await sync.addSet(setOf("missing-session", 80));
    net.down = false;
    const orig = server.addSet.bind(server);
    server.addSet = async () => {
      throw new Error("[store:supabase] addSet: insert violates foreign key constraint");
    };
    await sync.sync();
    server.addSet = orig;
    expect(sync.status()).toMatchObject({ pending: 0 });
    expect(sync.status().errors[0]).toContain("foreign key");
  });

  it("classifies network errors", () => {
    expect(isNetworkError(new Error("TypeError: Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("Load failed"))).toBe(true);
    expect(isNetworkError(new Error("duplicate key value"))).toBe(false);
  });
});
