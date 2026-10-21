"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppConfig } from "@/config/app.config";
import { THEME_PRESETS } from "@/config/themes";
import { now as cfgNow, readLocalOverrides, resolveConfig, writeLocalOverrides } from "@/config/runtime";
import type { Profile } from "@/lib/domain/types";
import { createStore, type Store } from "@/lib/store";
import { SupabaseStore } from "@/lib/store/supabase";
import { LoginScreen } from "./LoginScreen";

interface Ctx {
  cfg: AppConfig;
  store: Store;
  profile: Profile;
  /** Bump to make pages reload their data. */
  version: number;
  refresh: () => void;
  now: () => Date;
  overrides: unknown;
  setOverrides: (o: unknown | null) => void;
  setProfile: (p: Profile) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverridesState] = useState<unknown>(undefined);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    setOverridesState(readLocalOverrides());
    setReady(true);
  }, []);

  const cfg = useMemo(() => (ready ? resolveConfig(overrides) : null), [ready, overrides]);
  const store = useMemo(() => {
    if (!cfg) return null;
    try {
      return createStore(cfg);
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, [cfg]);

  // Theme: preset vars + per-variable overrides → CSS variables on <html>.
  useEffect(() => {
    if (!cfg) return;
    const preset = THEME_PRESETS[cfg.theme.preset] ?? THEME_PRESETS.midnight;
    const vars = { ...preset.vars, ...cfg.theme.vars };
    const root = document.documentElement;
    root.dataset.style = cfg.theme.style === "auto" ? preset.style : cfg.theme.style;
    for (const name of Array.from(root.style)) if (name.startsWith("--")) root.style.removeProperty(name);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(`--${k}`, v);
  }, [cfg]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // Theme + dashboard follow the account (Supabase): loaded once per visit, saved (debounced) on change.
  const storeRef = useRef<Store | null>(null);
  storeRef.current = store;
  const prefsLoaded = useRef(false);
  const prefsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    (async () => {
      if (store instanceof SupabaseStore) {
        const { data } = await store.sb.auth.getSession();
        if (!data.session) {
          setNeedsLogin(true);
          return;
        }
      }
      try {
        const p = await store.getProfile();
        if (!cancelled) setProfile(p);
        if (!prefsLoaded.current) {
          prefsLoaded.current = true;
          const prefs = await store.getPrefs().catch(() => null);
          if (!cancelled && prefs && (prefs.theme || prefs.dashboard)) {
            const next = { ...((readLocalOverrides() ?? {}) as Record<string, unknown>) };
            if (prefs.theme) next.theme = prefs.theme;
            if (prefs.dashboard) next.dashboard = prefs.dashboard;
            writeLocalOverrides(next);
            setOverridesState(next);
          }
        }
      } catch (e) {
        setError(String(e));
      }
    })();
    const unsub = store.subscribe(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [store, refresh]);

  const setOverrides = useCallback((o: unknown | null) => {
    writeLocalOverrides(o);
    setOverridesState(o ?? undefined);
    const picked = (o ?? {}) as { theme?: unknown; dashboard?: unknown };
    if (prefsTimer.current) clearTimeout(prefsTimer.current);
    prefsTimer.current = setTimeout(() => {
      storeRef.current?.savePrefs({ theme: picked.theme, dashboard: picked.dashboard }).catch((e) => console.warn("[prefs] save failed", e));
    }, 600);
  }, []);

  if (error) return <div className="page"><h1>Something broke</h1><pre className="code">{error}</pre><p>Check your .env and Settings → Config. Clear overrides: <button className="btn" onClick={() => { writeLocalOverrides(null); location.reload(); }}>Reset config</button></p></div>;
  if (needsLogin && store instanceof SupabaseStore) return <LoginScreen store={store} />;
  if (!cfg || !store || !profile) return <div className="page muted">Loading…</div>;

  const value: Ctx = { cfg, store, profile, version, refresh, now: () => cfgNow(cfg), overrides, setOverrides, setProfile };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
