import { NextResponse, type NextRequest } from "next/server";
import { resolveConfig } from "@/config/runtime";
import { serviceClient, SupabaseBotData } from "@/lib/bot/data";
import { sendDM } from "@/lib/bot/discord";
import { runReminders } from "@/lib/bot/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called every minute by Supabase Cron (see supabase/cron.sql.example) with
 * `Authorization: Bearer <CRON_SECRET>`. Sends due reminders as Discord DMs.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!secret || !botToken) return NextResponse.json({ error: "CRON_SECRET and DISCORD_BOT_TOKEN must be set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cfg = resolveConfig();
  let results;
  try {
    results = await runReminders({
      data: new SupabaseBotData(serviceClient, cfg),
      cfg,
      now: new Date(),
      appUrl: process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin,
      sendDM: (discordId, reply) => sendDM(botToken, discordId, reply),
    });
  } catch (e) {
    console.error("[cron] reminders", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  const count = (r: string) => results.filter((x) => x.result === r).length;
  return NextResponse.json({ due: results.length, sent: count("sent"), skipped: count("skipped"), failed: count("failed"), retry: count("retry"), results });
}

export const POST = handle;
export const GET = handle;
