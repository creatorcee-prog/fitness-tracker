import { NextResponse, type NextRequest } from "next/server";
import { resolveConfig } from "@/config/runtime";
import { aiEnvFromProcess, handleAsk, type ChatTurn } from "@/lib/ai/ask";
import { serviceClient, SupabaseBotData } from "@/lib/bot/data";
import { hubAuthorized, hubCommand, hubEnvFromProcess, hubSummary, type HubCommandInput } from "@/lib/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The bot hub's line to James (see src/lib/hub.ts). GET: the training
 * summary for the hub's Fitness card. POST {question, history}: ask James,
 * with the same prompt, caps and usage tracking as the in-app chat.
 * POST {command, options} or {component, values}: the Discord bot's
 * training commands (log with Confirm, undo, done, today...) for the
 * linked account. All need `Authorization: Bearer <HUB_SECRET>`.
 */
function gate(req: NextRequest) {
  const env = hubEnvFromProcess();
  if (!env.secret || !env.userId) return { env, fail: NextResponse.json({ error: "HUB_SECRET and HUB_USER_ID must be set" }, { status: 503 }) };
  if (!hubAuthorized(req.headers.get("authorization"), env)) return { env, fail: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { env, fail: null };
}

export async function GET(req: NextRequest) {
  const { env, fail } = gate(req);
  if (fail) return fail;
  try {
    const cfg = resolveConfig();
    const s = await hubSummary(new SupabaseBotData(serviceClient, cfg), cfg, env, new Date());
    if (!s) return NextResponse.json({ error: "HUB_USER_ID doesn't match an account" }, { status: 404 });
    return NextResponse.json(s);
  } catch (e) {
    console.error("[hub] summary", e);
    return NextResponse.json({ error: "summary failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { env, fail } = gate(req);
  if (fail) return fail;
  const body = (await req.json().catch(() => ({}))) as { question?: string; history?: ChatTurn[] } & HubCommandInput;
  if (typeof body.command === "string" || typeof body.component === "string") {
    try {
      const cfg = resolveConfig();
      const reply = await hubCommand(new SupabaseBotData(serviceClient, cfg), cfg, env, new Date(),
        process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin, body);
      return NextResponse.json(reply);
    } catch (e) {
      console.error("[hub] command", e);
      return NextResponse.json({ content: "⚠️ Something went wrong. Try again in a bit." }, { status: 200 });
    }
  }
  if (typeof body.question !== "string") return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    const sb = serviceClient();
    const cfg = resolveConfig();
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((t) => t && typeof t.question === "string" && typeof t.answer === "string")
      .slice(-10);
    const r = await handleAsk(
      { data: new SupabaseBotData(() => sb, cfg), cfg, env: aiEnvFromProcess(), now: new Date(), who: { userId: env.userId }, appUrl: process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin, fetch },
      body.question,
      history,
    );
    console.log(`[ask:hub] outcome=${r.outcome}${r.model ? ` model=${r.model} in=${r.tokensIn} out=${r.tokensOut}` : ""}`);
    // Proposed changes need the app's Apply button, so the hub only learns how many there are.
    return NextResponse.json({ outcome: r.outcome, answer: r.answer ?? r.content, proposedChanges: r.actions?.length ?? 0 });
  } catch (e) {
    console.error("[ask:hub]", e);
    return NextResponse.json({ outcome: "error", answer: "⚠️ I couldn't answer right now. Please try again in a bit." }, { status: 200 });
  }
}
