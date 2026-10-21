import { defaultConfig, type AppConfig } from "./app.config";

export const OVERRIDES_KEY = "ft:config-overrides";

type Plain = Record<string, unknown>;

function isPlain(v: unknown): v is Plain {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep merge; arrays and primitives in `over` replace those in `base`. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isPlain(base) || !isPlain(over)) return (over === undefined ? base : over) as T;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in base ? deepMerge((base as Plain)[k], v) : v;
  }
  return out as T;
}

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("[config] ignoring invalid JSON override", raw);
    return undefined;
  }
}

export function readLocalOverrides(): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    return parseJson(window.localStorage.getItem(OVERRIDES_KEY));
  } catch {
    return undefined;
  }
}

export function writeLocalOverrides(overrides: unknown | null) {
  try {
    if (overrides == null) window.localStorage.removeItem(OVERRIDES_KEY);
    else window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    /* storage blocked */
  }
}

export function resolveConfig(localOverrides: unknown = readLocalOverrides()): AppConfig {
  let cfg = defaultConfig;
  const envBackend = process.env.NEXT_PUBLIC_DATA_BACKEND;
  if (envBackend === "local" || envBackend === "supabase" || envBackend === "local-sync") {
    cfg = deepMerge(cfg, { data: { backend: envBackend } });
  }
  cfg = deepMerge(cfg, parseJson(process.env.NEXT_PUBLIC_CONFIG_OVERRIDES));
  cfg = deepMerge(cfg, localOverrides);
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1") {
    cfg = deepMerge(cfg, { debug: { panel: true } });
  }
  return cfg;
}

/** "now", honoring debug.fakeNow. */
export function now(cfg: AppConfig): Date {
  return cfg.debug.fakeNow ? new Date(cfg.debug.fakeNow) : new Date();
}
