import { createPublicKey, verify } from "node:crypto";
import type { BotReply } from "./handlers";

const API = "https://discord.com/api/v10";

export const InteractionType = { PING: 1, COMMAND: 2, COMPONENT: 3, AUTOCOMPLETE: 4 } as const;
export const ResponseType = { PONG: 1, MESSAGE: 4, DEFERRED_MESSAGE: 5, DEFERRED_UPDATE: 6, AUTOCOMPLETE: 8 } as const;
export const EPHEMERAL = 64;

/** Ed25519 check that a request really came from Discord (required for every interaction). */
export function verifyDiscordRequest(body: string, signature: string | null, timestamp: string | null, publicKeyHex: string): boolean {
  if (!signature || !timestamp || !publicKeyHex) return false;
  try {
    // Wrap the raw 32-byte key in the SPKI header Node expects for Ed25519.
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

const STYLE = { primary: 1, secondary: 2, danger: 4 } as const;

/** BotReply → Discord message payload. Mentions are never parsed, so replies can't ping anyone. */
export function toMessage(reply: BotReply, flags = 0) {
  return {
    content: reply.content.slice(0, 2000),
    flags,
    allowed_mentions: { parse: [] as string[] },
    components: [
      ...(reply.select
        ? [{
            type: 1,
            components: [{
              type: 3, // string select menu
              custom_id: reply.select.id.slice(0, 100),
              placeholder: reply.select.placeholder,
              options: reply.select.options.slice(0, 25).map((o) => ({ label: o.label.slice(0, 100), value: o.value.slice(0, 100), description: o.description?.slice(0, 100) })),
            }],
          }]
        : []),
      ...(reply.buttons?.length
        ? [{ type: 1, components: reply.buttons.slice(0, 5).map((b) => ({ type: 2, style: STYLE[b.style ?? "secondary"], label: b.label, custom_id: b.id.slice(0, 100) })) }]
        : []),
    ],
  };
}

/** A failed Discord API call. `code` is Discord's JSON error code (e.g. 50007 = can't DM this user). */
export class DiscordError extends Error {
  constructor(message: string, readonly status: number, readonly code: number | null) {
    super(message);
  }
}

async function discordFetch(path: string, init: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (!res.ok) {
    const text = await res.text();
    let code: number | null = null;
    try {
      code = JSON.parse(text).code ?? null;
    } catch {
      /* not JSON */
    }
    throw new DiscordError(`Discord ${init.method} ${path.split("/").slice(0, 3).join("/")}: ${res.status} ${text}`, res.status, code);
  }
  return res;
}

/** DM a user. Requires that the bot shares a server with them and they allow DMs from server members. */
export async function sendDM(botToken: string, discordUserId: string, reply: BotReply) {
  const auth = { Authorization: `Bot ${botToken}` };
  const ch = await (await discordFetch("/users/@me/channels", { method: "POST", headers: auth, body: JSON.stringify({ recipient_id: discordUserId }) })).json();
  await discordFetch(`/channels/${ch.id}/messages`, { method: "POST", headers: auth, body: JSON.stringify(toMessage(reply)) });
}

/** Post in a server channel (needs the bot installed in that server with View Channel + Send Messages). */
export async function postToChannel(botToken: string, channelId: string, reply: BotReply) {
  await discordFetch(`/channels/${channelId}/messages`, { method: "POST", headers: { Authorization: `Bot ${botToken}` }, body: JSON.stringify(toMessage(reply)) });
}

/** Replace the deferred "thinking…" reply, or the message a button was on. */
export function editOriginal(appId: string, token: string, reply: BotReply) {
  const { flags: _flags, ...msg } = toMessage(reply);
  return discordFetch(`/webhooks/${appId}/${token}/messages/@original`, { method: "PATCH", body: JSON.stringify(msg) });
}

/** Post a new message in reply to an interaction (used after a button press). */
export function followUp(appId: string, token: string, reply: BotReply, flags: number) {
  return discordFetch(`/webhooks/${appId}/${token}`, { method: "POST", body: JSON.stringify(toMessage(reply, flags)) });
}

// integration_types: 0 = server install, 1 = user install.
// contexts: 0 = server, 1 = DM with the bot, 2 = other DMs / group DMs.
const EVERYWHERE = { integration_types: [0, 1], contexts: [0, 1, 2] };
const STRING = 3;
const NUMBER = 10;

export const COMMANDS = [
  { name: "today", description: "Today's split day, targets and last time's numbers" },
  {
    name: "log",
    description: "Log sets in plain text, then confirm. e.g. 4x8 bench 185",
    options: [{ type: STRING, name: "sets", description: "4x8 bench 185 · bench 185 4x8 · squat 3x5 @ 225 · deadlift 405x3 · add kg for kilos", required: true, max_length: 200 }],
  },
  { name: "undo", description: "Remove your last logged set" },
  { name: "done", description: "Finish the workout and move your split to the next day" },
  { name: "skip", description: "Skip today's day without logging (rotation splits)" },
  { name: "swap", description: "Train a different split day today", options: [{ type: STRING, name: "day", description: "Split day", required: true, autocomplete: true }] },
  { name: "lift", description: "Last session, records and % gain for a lift", options: [{ type: STRING, name: "name", description: "Lift", required: true, autocomplete: true }] },
  { name: "streak", description: "Sessions this week and your weekly streak" },
  { name: "friends", description: "Which friends have lifted today" },
  { name: "goal", description: "Your goals with progress bars and projected dates" },
  {
    name: "bodyweight",
    description: "Log today's bodyweight, or see your trend",
    options: [
      { type: NUMBER, name: "weight", description: "Today's weight (leave empty to see your trend)", required: false, min_value: 0 },
      { type: STRING, name: "unit", description: "lb or kg (default: yours)", required: false, choices: [{ name: "lb", value: "lb" }, { name: "kg", value: "kg" }] },
    ],
  },
  {
    name: "leaderboard",
    description: "Friends ranked by % strength gain this month (opt-in)",
    options: [{ type: STRING, name: "mode", description: "view (default), join or leave", required: false, choices: [{ name: "view", value: "view" }, { name: "join", value: "join" }, { name: "leave", value: "leave" }] }],
  },
  { name: "help", description: "How to use the bot: logging shorthand, commands, linking" },
  {
    name: "plates",
    description: "Plates per side for a weight",
    options: [
      { type: NUMBER, name: "weight", description: "Total weight including the bar", required: true, min_value: 0 },
      { type: STRING, name: "unit", description: "lb or kg (default: yours)", required: false, choices: [{ name: "lb", value: "lb" }, { name: "kg", value: "kg" }] },
    ],
  },
  { name: "rest", description: "Start a rest countdown", options: [{ type: STRING, name: "time", description: "e.g. 2m, 90, 1:30 (default from your settings)", required: false }] },
].map((c) => ({ ...c, ...EVERYWHERE }));

// /ask: AI answers. The description carries the privacy notice (Discord max 100 chars).
COMMANDS.push({
  name: "ask",
  description: "Ask James (AI coach). Your question + a training summary are sent to Groq.",
  options: [{ type: STRING, name: "question", description: "e.g. How is my bench trending? What should I add next Push day?", required: true, max_length: 1500 }],
  ...EVERYWHERE,
} as (typeof COMMANDS)[number]);

// Announcements post in a server channel, so /announce only exists in servers.
COMMANDS.push({
  name: "announce",
  description: "Post your PRs in this channel (opt-in)",
  options: [{ type: STRING, name: "mode", description: "on: post my PRs here · off: stop", required: true, choices: [{ name: "on", value: "on" }, { name: "off", value: "off" }] }],
  integration_types: [0, 1],
  contexts: [0],
} as (typeof COMMANDS)[number]);

/** Bulk overwrite: idempotent, so it's safe to run on every endpoint verification. */
export async function registerCommands(appId: string, botToken: string) {
  const res = await discordFetch(`/applications/${appId}/commands`, { method: "PUT", headers: { Authorization: `Bot ${botToken}` }, body: JSON.stringify(COMMANDS) });
  return (await res.json()) as { name: string }[];
}

export async function listCommands(appId: string, botToken: string) {
  const res = await discordFetch(`/applications/${appId}/commands`, { method: "GET", headers: { Authorization: `Bot ${botToken}` } });
  return (await res.json()) as { name: string }[];
}
