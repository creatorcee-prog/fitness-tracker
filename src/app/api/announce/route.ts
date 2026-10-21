import { NextResponse, type NextRequest } from "next/server";
import { resolveConfig } from "@/config/runtime";
import { serviceClient, SupabaseBotData } from "@/lib/bot/data";
import { postToChannel } from "@/lib/bot/discord";
import { announcementText } from "@/lib/bot/handlers";
import { prsForSet, replayPRs } from "@/lib/domain/prs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECENT_MS = 10 * 60_000;

/**
 * The web app calls this after saving a set. The server verifies the caller,
 * recomputes PRs itself (the client can't claim one) and posts to the user's
 * /announce channel, once per set, and only for sets saved in the last 10 minutes.
 */
export async function POST(req: NextRequest) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return new NextResponse(null, { status: 204 });
  const jwt = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const { setId } = (await req.json().catch(() => ({}))) as { setId?: string };
  if (!jwt || !setId) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const sb = serviceClient();
  const { data: auth } = await sb.auth.getUser(jwt);
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cfg = resolveConfig();
  const data = new SupabaseBotData(() => sb, cfg);
  const user = await data.getUserById(auth.user.id);
  if (!user?.announcePrs || !user.announceChannelId) return new NextResponse(null, { status: 204 });

  const set = await data.getSet(user.id, setId);
  if (!set || Date.now() - Date.parse(set.createdAt) > RECENT_MS) return new NextResponse(null, { status: 204 });
  const [sets, sessions, exercises] = await Promise.all([data.listSets(user.id, { exerciseId: set.exerciseId }), data.listSessions(user.id), data.listExercises(user.id)]);
  const prs = prsForSet(replayPRs(sets, sessions, cfg), set.id);
  if (!prs.length || !(await data.claimAnnouncement(user.id, set.id))) return new NextResponse(null, { status: 204 });

  const name = exercises.find((e) => e.id === set.exerciseId)?.name ?? "lift";
  await postToChannel(botToken, user.announceChannelId, { content: announcementText(user.displayName, name, prs, set, user.unit) });
  return NextResponse.json({ announced: true });
}
