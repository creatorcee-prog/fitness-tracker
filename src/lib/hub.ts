import { timingSafeEqual } from "node:crypto";
import type { AppConfig } from "@/config/app.config";
import { buildTrainingContext } from "@/lib/ai/context";
import type { BotData } from "@/lib/bot/data";
import { handleCommand, handleComponent, type BotReply, type Options } from "@/lib/bot/handlers";

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

/**
 * Workout commands from the hub ("James, log bench 185 4x8"), run by the
 * same handlers as the Discord bot, for the one linked account. The hub
 * shows the reply and turns its buttons (Confirm, which lift, Same again,
 * Undo) into its own; pressing one comes back here as a component.
 * Only training commands: nothing social, nothing that posts to Discord.
 */
export const HUB_COMMANDS = new Set(["today", "log", "undo", "done", "skip", "lift", "streak", "goal", "bodyweight", "plates", "rest", "help"]);
const HUB_COMPONENTS = /^(lc|lp|lx|undo|again|skip)(:|$)/;

/** The bot's data, with "who is this Discord user?" answered by HUB_USER_ID. */
export function hubBotData(data: BotData, env: HubEnv): BotData {
  return new Proxy(data, {
    get(target, prop, receiver) {
      if (prop === "findUser") return () => target.getUserById(env.userId);
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

export interface HubCommandInput {
  command?: string;
  options?: Options;
  component?: string;
  values?: string[];
}

export async function hubCommand(data: BotData, cfg: AppConfig, env: HubEnv, now: Date, appUrl: string, input: HubCommandInput): Promise<BotReply> {
  const ctx = { data: hubBotData(data, env), cfg, now, discordUserId: `hub:${env.userId}`, appUrl };
  if (input.component !== undefined) {
    if (!HUB_COMPONENTS.test(input.component)) return { content: "That button isn't available from the hub." };
    return handleComponent(ctx, input.component, Array.isArray(input.values) ? input.values.map(String).slice(0, 5) : []);
  }
  const name = String(input.command ?? "");
  if (!HUB_COMMANDS.has(name)) return { content: `/${name} isn't available from the hub.` };
  const opts: Options = {};
  for (const [k, v] of Object.entries(input.options ?? {})) {
    if (["string", "number", "boolean"].includes(typeof v)) opts[k] = typeof v === "string" ? v.slice(0, 200) : v;
  }
  return handleCommand(ctx, name, opts);
}
