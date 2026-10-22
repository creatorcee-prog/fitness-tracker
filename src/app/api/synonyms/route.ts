import { NextResponse, type NextRequest } from "next/server";
import { aiEnvFromProcess, checkAiCaps } from "@/lib/ai/ask";
import { serviceClient, SupabaseBotData } from "@/lib/bot/data";
import { resolveConfig } from "@/config/runtime";
import { approve, dismissMiss, loadReview, reject, suggest } from "@/lib/synonyms/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The app owner only: accounts listed in AI_DEV_USER_IDS. Everyone else gets 403. */
async function owner(req: NextRequest) {
  const jwt = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!jwt) return null;
  const sb = serviceClient();
  const { data } = await sb.auth.getUser(jwt);
  const env = aiEnvFromProcess();
  return data.user && env.devUserIds.includes(data.user.id) ? { sb, env, userId: data.user.id } : null;
}

const forbidden = () => NextResponse.json({ ok: false, message: "Only the app owner (AI_DEV_USER_IDS) can review synonyms." }, { status: 403 });

export async function GET(req: NextRequest) {
  const o = await owner(req);
  if (!o) return forbidden();
  try {
    return NextResponse.json({ ok: true, ...(await loadReview(o.sb)) });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const o = await owner(req);
  if (!o) return forbidden();
  const body = (await req.json().catch(() => ({}))) as { action?: string; alias?: string; exerciseId?: string; source?: string; mode?: string; name?: string };
  try {
    switch (body.action) {
      case "approve":
        await approve(o.sb, String(body.alias ?? ""), String(body.exerciseId ?? ""), body.source === "ai" ? "ai" : body.source === "votes" ? "votes" : "review");
        return NextResponse.json({ ok: true });
      case "reject":
        await reject(o.sb, String(body.alias ?? ""), String(body.exerciseId ?? ""));
        return NextResponse.json({ ok: true });
      case "dismiss":
        await dismissMiss(o.sb, String(body.name ?? ""));
        return NextResponse.json({ ok: true });
      case "suggest": {
        const cfg = resolveConfig();
        const data = new SupabaseBotData(() => o.sb, cfg);
        const day = new Date().toISOString().slice(0, 10);
        const caps = await checkAiCaps(data, o.env, o.userId, day);
        if (caps.blocked) return NextResponse.json({ ok: false, message: `AI limit reached for today (${caps.limit}).` });
        if (!o.env.enabled || !o.env.apiKey) return NextResponse.json({ ok: false, message: "AI is off (GROQ_API_KEY not set)." });
        const r = await suggest(o.sb, o.env, body.mode === "library" ? "library" : "misses", fetch);
        await data.recordAiUsage(o.userId, day, r.tokensIn, r.tokensOut).catch(() => {});
        return NextResponse.json({ ok: true, suggestions: r.suggestions });
      }
      default:
        return NextResponse.json({ ok: false, message: "bad request" }, { status: 400 });
    }
  } catch (e) {
    console.error("[synonyms]", e);
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
