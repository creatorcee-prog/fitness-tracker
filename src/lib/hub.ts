import { timingSafeEqual } from "node:crypto";
import type { AppConfig } from "@/config/app.config";
import { buildTrainingContext } from "@/lib/ai/context";
import type { BotData } from "@/lib/bot/data";

/**
 * Link to the bot hub (creatorcee-prog/dashboard-app). The hub's dashboard
 * shows James's training summary and lets its owner chat with him through
 * /api/hub. One account only: HUB_USER_ID names whose data the hub sees.
 * The hub proves itself with `Authorization: Bearer <HUB_SECRET>`.
 */
export interface HubEnv {
  secret: string;
  userId: string;
}

export function hubEnvFromProcess(e: NodeJS.ProcessEnv = process.env): HubEnv {
  return { secret: e.HUB_SECRET ?? "", userId: e.HUB_USER_ID ?? "" };
}

/** Constant-time check of the hub's bearer token; false when the link isn't configured. */
export function hubAuthorized(header: string | null, env: HubEnv): boolean {
  if (!env.secret || !env.userId || !header) return false;
  const got = Buffer.from(header);
  const want = Buffer.from(`Bearer ${env.secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Small enough for a dashboard card; the full context is for /ask. */
const SUMMARY_TOKENS = 600;

/**
 * The hub's Fitness card: the same server-built facts James reads before
 * answering, so the card and his answers never disagree. null if
 * HUB_USER_ID doesn't match an account.
 */
export async function hubSummary(data: BotData, cfg: AppConfig, env: HubEnv, now: Date): Promise<{ coach: string; summary: string } | null> {
  const user = await data.getUserById(env.userId);
  if (!user) return null;
  return { coach: cfg.brand.botName, summary: await buildTrainingContext(data, user, cfg, now, SUMMARY_TOKENS) };
}
