import { after, NextResponse, type NextRequest } from "next/server";
import { resolveConfig } from "@/config/runtime";
import { serviceClient, SupabaseBotData } from "@/lib/bot/data";
import {
  editOriginal, EPHEMERAL, followUp, InteractionType, listCommands, registerCommands, ResponseType, toMessage, verifyDiscordRequest,
} from "@/lib/bot/discord";
import { ACCOUNTLESS, componentMode, handleAutocomplete, handleCommand, handleComponent, type BotContext, type Options } from "@/lib/bot/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

const env = () => ({
  publicKey: process.env.DISCORD_PUBLIC_KEY ?? "",
  appId: process.env.DISCORD_APPLICATION_ID ?? "",
  botToken: process.env.DISCORD_BOT_TOKEN ?? "",
});

function context(req: NextRequest, i: any): BotContext {
  const cfg = resolveConfig();
  return {
    cfg,
    data: new SupabaseBotData(serviceClient, cfg),
    now: new Date(),
    discordUserId: i.member?.user?.id ?? i.user?.id,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin,
  };
}

function flatten(options: any[] | undefined): Options {
  const out: Options = {};
  for (const o of options ?? []) out[o.name] = o.value;
  return out;
}

/** Discord sends every slash command, button press and autocomplete here. */
export async function POST(req: NextRequest) {
  const { publicKey, appId, botToken } = env();
  const body = await req.text();
  if (!verifyDiscordRequest(body, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"), publicKey)) {
    return new NextResponse("invalid request signature", { status: 401 });
  }
  const i = JSON.parse(body);

  // Discord pings when you save the Interactions Endpoint URL: a good moment to (re)register commands.
  if (i.type === InteractionType.PING) {
    if (appId && botToken) after(() => registerCommands(appId, botToken).catch((e) => console.error("[bot] register", e)));
    return NextResponse.json({ type: ResponseType.PONG });
  }

  const ctx = context(req, i);
  const flags = i.guild_id && ctx.cfg.bot.ephemeralInGuilds ? EPHEMERAL : 0;
  const app = i.application_id as string;

  if (i.type === InteractionType.AUTOCOMPLETE) {
    const focused = (i.data.options ?? []).find((o: any) => o.focused);
    const choices = await handleAutocomplete(ctx, i.data.name, String(focused?.value ?? ""));
    return NextResponse.json({ type: ResponseType.AUTOCOMPLETE, data: { choices } });
  }

  if (i.type === InteractionType.COMMAND) {
    const name = i.data.name as string;
    const opts = flatten(i.data.options);
    if (ACCOUNTLESS.has(name)) {
      return NextResponse.json({ type: ResponseType.MESSAGE, data: toMessage(await handleCommand(ctx, name, opts), flags) });
    }
    // Database work can exceed Discord's 3-second limit on a cold start, so
    // acknowledge now ("thinking…") and fill in the answer right after.
    after(async () => {
      const reply = await handleCommand(ctx, name, opts);
      await editOriginal(app, i.token, reply).catch((e) => console.error("[bot] edit", e));
    });
    return NextResponse.json({ type: ResponseType.DEFERRED_MESSAGE, data: { flags } });
  }

  if (i.type === InteractionType.COMPONENT) {
    const id = String(i.data.custom_id);
    const mode = componentMode(id);
    after(async () => {
      const reply = await handleComponent(ctx, id);
      const send = mode === "new" ? followUp(app, i.token, reply, flags) : editOriginal(app, i.token, reply);
      await send.catch((e) => console.error("[bot] component", e));
    });
    return NextResponse.json({ type: ResponseType.DEFERRED_UPDATE });
  }

  return new NextResponse("unsupported interaction", { status: 400 });
}

/**
 * Setup check: open /api/discord in a browser. Shows which settings are
 * present (never their values) and which commands Discord has registered.
 * Add ?register=1 to register the commands manually.
 */
export async function GET(req: NextRequest) {
  const { publicKey, appId, botToken } = env();
  const configured = {
    DISCORD_PUBLIC_KEY: !!publicKey,
    DISCORD_APPLICATION_ID: !!appId,
    DISCORD_BOT_TOKEN: !!botToken,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
  let commands: string[] | string = "not checked (missing app id or bot token)";
  if (appId && botToken) {
    try {
      // ?register=1 re-registers by hand (idempotent) if the automatic one on PING didn't happen.
      if (new URL(req.url).searchParams.get("register") === "1") await registerCommands(appId, botToken);
      commands = (await listCommands(appId, botToken)).map((c) => `/${c.name}`);
    } catch (e) {
      commands = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return NextResponse.json({ ok: Object.values(configured).every(Boolean), configured, commands });
}
