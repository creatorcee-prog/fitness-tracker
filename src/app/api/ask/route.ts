import { NextResponse, type NextRequest } from "next/server";
import { resolveConfig } from "@/config/runtime";
import { aiEnvFromProcess, handleAsk, type ChatTurn } from "@/lib/ai/ask";
import { serviceClient, SupabaseBotData } from "@/lib/bot/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * In-app chat with the coach. Same logic, prompt, caps and usage tracking as
 * Discord /ask. The caller proves who they are with their Supabase session
 * token; the Groq key stays on the server.
 */
export async function POST(req: NextRequest) {
  const jwt = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const body = (await req.json().catch(() => ({}))) as { question?: string; history?: ChatTurn[] };
  if (!jwt || typeof body.question !== "string") return NextResponse.json({ error: "bad request" }, { status: 400 });

  try {
    const sb = serviceClient();
    const { data: auth } = await sb.auth.getUser(jwt);
    if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const cfg = resolveConfig();
    // History comes from the browser: keep it small and well-formed.
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((t) => t && typeof t.question === "string" && typeof t.answer === "string")
      .slice(-10);
    const r = await handleAsk(
      { data: new SupabaseBotData(() => sb, cfg), cfg, env: aiEnvFromProcess(), now: new Date(), who: { userId: auth.user.id }, appUrl: new URL(req.url).origin, fetch },
      body.question,
      history,
    );
    console.log(`[ask:app] outcome=${r.outcome}${r.model ? ` model=${r.model} in=${r.tokensIn} out=${r.tokensOut}` : ""}${r.actions?.length ? ` actions=${r.actions.map((a) => a.type).join(",")}` : ""}`);
    return NextResponse.json({ outcome: r.outcome, answer: r.answer ?? r.content, actions: r.actions ?? [] });
  } catch (e) {
    console.error("[ask:app]", e);
    return NextResponse.json({ outcome: "error", answer: "⚠️ I couldn't answer right now. Please try again in a bit." }, { status: 200 });
  }
}
