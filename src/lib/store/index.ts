import type { AppConfig } from "@/config/app.config";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";
import { SyncStore } from "./sync";
import type { Store } from "./types";

/** Debug: a store that fails like fetch() whenever the browser is offline. */
function failWhenOffline(inner: Store): Store {
  return new Proxy(inner, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (typeof v !== "function" || prop === "subscribe") return v;
      return async (...args: unknown[]) => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("TypeError: Failed to fetch (simulated)");
        return v.apply(target, args);
      };
    },
  });
}

export function createStore(cfg: AppConfig): Store {
  if (cfg.data.backend === "local-sync") {
    const server = new LocalStore({ ...cfg, data: { ...cfg.data, localStorageKey: "ft:fake-server" } });
    return new SyncStore(cfg, failWhenOffline(server), async () => "local-user");
  }
  if (cfg.data.backend !== "supabase") return new LocalStore(cfg);
  const remote = new SupabaseStore(cfg);
  if (!cfg.data.offline) return remote;
  // Offline logging: same behaviour online, plus a device mirror + outbox for when the gym has no signal.
  return new SyncStore(cfg, remote, async () => (await remote.sb.auth.getSession()).data.session?.user.id ?? null);
}

/** The Supabase store behind `store` (directly or inside the offline wrapper), for auth calls. */
export function supabaseOf(store: Store): SupabaseStore | null {
  if (store instanceof SupabaseStore) return store;
  if (store instanceof SyncStore && store.remote instanceof SupabaseStore) return store.remote;
  return null;
}

export type { Store } from "./types";
