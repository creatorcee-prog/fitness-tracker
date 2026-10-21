import type { AppConfig } from "@/config/app.config";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export function createStore(cfg: AppConfig): Store {
  return cfg.data.backend === "supabase" ? new SupabaseStore(cfg) : new LocalStore(cfg);
}

export type { Store } from "./types";
