import { NextResponse, type NextRequest } from "next/server";
import { resolveConfig } from "@/config/runtime";
import { serviceClient, SupabaseBotData } from "@/lib/bot/data";
import { sendDM } from "@/lib/bot/discord";
import { sendTestReminder } from "@/lib/bot/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings → "Send test reminder". Signed-in users can only DM themselves. */
export async function POST(req: NextRequest) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ ok: false, message: "DISCORD_BOT_TOKEN isn't set on the server." });
  const jwt = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!jwt) return NextResponse.json({ ok: false, message: "Not signed in." }, { status: 401 });
  try {
    const sb = serviceClient();
    const { data: auth } = await sb.auth.getUser(jwt);
    if (!auth.user) return NextResponse.json({ ok: false, message: "Not signed in." }, { status: 401 });
    const { reminderId } = (await req.json().catch(() => ({}))) as { reminderId?: string };
    const cfg = resolveConfig();
    const r = await sendTestReminder(
      { data: new SupabaseBotData(() => sb, cfg), cfg, now: new Date(), appUrl: new URL(req.url).origin, sendDM: (id, reply) => sendDM(botToken, id, reply) },
      auth.user.id,
      typeof reminderId === "string" ? reminderId : undefined,
    );
    return NextResponse.json(r);
  } catch (e) {
    console.error("[reminders:test]", e);
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : String(e) });
  }
}
