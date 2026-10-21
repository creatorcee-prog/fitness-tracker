import { NextResponse, type NextRequest } from "next/server";
import { resolveConfig } from "@/config/runtime";
import { aiEnvFromProcess } from "@/lib/ai/ask";
import { serviceClient, SupabaseBotData } from "@/lib/bot/data";
import { importEnvFromProcess, readWithJames } from "@/lib/import/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Have James read it" on the Import page. Returns structured data for the
 * preview; it never saves anything (the browser saves after you confirm).
 */
export async function POST(req: NextRequest) {
  const jwt = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const body = (await req.json().catch(() => ({}))) as { text?: string; images?: unknown };
  const images = Array.isArray(body.images) ? body.images.filter((x): x is string => typeof x === "string") : [];
  if (!jwt || typeof body.text !== "string") return NextResponse.json({ ok: false, message: "bad request" }, { status: 400 });
  try {
    const sb = serviceClient();
    const { data: auth } = await sb.auth.getUser(jwt);
    if (!auth.user) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
    const cfg = resolveConfig();
    const r = await readWithJames(
      { data: new SupabaseBotData(() => sb, cfg), cfg, env: aiEnvFromProcess(), importEnv: importEnvFromProcess(), now: new Date(), userId: auth.user.id, fetch },
      body.text,
      images,
    );
    console.log(`[import] ${r.ok ? `ok model=${r.model} in=${r.tokensIn} out=${r.tokensOut} sessions=${r.data.sessions.length}` : `outcome=${r.outcome}`} chars=${body.text.length} images=${images.length}`);
    return NextResponse.json(r);
  } catch (e) {
    console.error("[import]", e);
    return NextResponse.json({ ok: false, outcome: "error", message: "Couldn't read it right now. Please try again in a bit." });
  }
}
