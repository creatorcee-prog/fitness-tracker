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
    components: reply.buttons?.length
      ? [{ type: 1, components: reply.buttons.slice(0, 5).map((b) => ({ type: 2, style: STYLE[b.style ?? "secondary"], label: b.label, custom_id: b.id.slice(0, 100) })) }]
      : [],
  };
}

async function discordFetch(path: string, init: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`Discord ${init.method} ${path.split("/").slice(0, 3).join("/")}: ${res.status} ${await res.text()}`);
  return res;
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
    description: "Log sets, e.g. bench 185x5x3",
    options: [{ type: STRING, name: "sets", description: "bench 185x5 · bench 185x5x3 · squat 225 5,5,4 · 185x5 (same lift as last)", required: true }],
  },
  { name: "undo", description: "Remove your last logged set" },
  { name: "done", description: "Finish the workout and move your split to the next day" },
  { name: "skip", description: "Skip today's day without logging (rotation splits)" },
  { name: "swap", description: "Train a different split day today", options: [{ type: STRING, name: "day", description: "Split day", required: true, autocomplete: true }] },
  { name: "lift", description: "Last session, records and % gain for a lift", options: [{ type: STRING, name: "name", description: "Lift", required: true, autocomplete: true }] },
  { name: "streak", description: "Sessions this week and your weekly streak" },
  { name: "friends", description: "Which friends have lifted today" },
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

/** Bulk overwrite: idempotent, so it's safe to run on every endpoint verification. */
export async function registerCommands(appId: string, botToken: string) {
  const res = await discordFetch(`/applications/${appId}/commands`, { method: "PUT", headers: { Authorization: `Bot ${botToken}` }, body: JSON.stringify(COMMANDS) });
  return (await res.json()) as { name: string }[];
}

export async function listCommands(appId: string, botToken: string) {
  const res = await discordFetch(`/applications/${appId}/commands`, { method: "GET", headers: { Authorization: `Bot ${botToken}` } });
  return (await res.json()) as { name: string }[];
}
