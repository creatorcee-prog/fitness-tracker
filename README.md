# Fitness Tracker

Phase 1 (lifting core) of the build plan: fast set logging, automatic PR detection, PR-marked graphs and a split that always knows what day it is. It also includes friends, a customizable dashboard and themes.

## Quick start

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_DATA_BACKEND=local needs nothing else
npm run dev                  # http://localhost:3000
npm test                     # domain logic unit tests
```

The **local** backend keeps everything in this browser (localStorage) with no account needed, which makes it the easy way to debug. Settings → **Generate demo history** fills 12 weeks of sessions, so charts, PRs and % gain have data.

### Supabase backend

1. Create a Supabase project. Under Auth → Providers, enable **Discord**.
2. Run `supabase/migrations/0001_init.sql`, `0002_friends.sql`, then `supabase/seed.sql` (SQL editor or `supabase db push`).
3. Set `NEXT_PUBLIC_DATA_BACKEND=supabase`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Add `<your-origin>/auth/callback` to the allowed redirect URLs.

## Everything is configurable

Every tunable lives in [`src/config/app.config.ts`](src/config/app.config.ts): units, stepper increments, progression jumps, e1RM formula and rep cap, rest timer per category, % gain windows, chart ranges, plates, feature flags, theme, dashboard widgets, friends, and exercise aliases for the shorthand box.

Overrides are applied in this order, later winning:

1. Defaults in `app.config.ts`
2. `NEXT_PUBLIC_CONFIG_OVERRIDES` (JSON, applied at build time)
3. **Settings → Config (debug)**: a JSON editor saved per browser, with Apply, Reset and Undo

Debug tools:
- Add `?debug=1` to any URL to open the 🐞 panel. It shows the effective config and the store state (today, split pointer, open session), and has **time travel** (±1 day via `debug.fakeNow`) for testing weekly splits and % gain.
- `debug.logStore` logs every store call to the console.
- Settings has a "5s rest timer" shortcut.

## What's built

| Feature | Where |
|---|---|
| Opens straight to today; one tap saves a set prefilled from last time | `src/app/page.tsx` |
| Double progression (+5 lb upper / +10 lb lower when every rep was hit; holds after a miss) | `src/lib/domain/progression.ts` |
| Steppers in a bottom thumb-zone dock; long-press or double-click opens the number pad | `src/components/Stepper.tsx` |
| Shorthand: `185x5x3`, `185 5,5,4`, `185x5, 195x3`, `80kg x5 @8`, `ohp 95x8` | `src/lib/domain/shorthand.ts` |
| Undo toasts instead of confirm dialogs (save, delete, finish, skip, config) | `src/components/UndoToast.tsx` |
| Rest timer that starts itself, with gradient ring, ±15 s, beep and vibrate | `src/components/RestTimer.tsx` |
| PRs: heaviest, reps at weight or heavier, e1RM (≤10 reps), session volume; warm-ups excluded; rebuilt by replay when sets are edited or deleted | `src/lib/domain/prs.ts` |
| e1RM line, top-set and weekly volume charts with PR pins; 4W/12W/1Y/All ranges | `src/app/progress/page.tsx` |
| % gain vs first log, 4 weeks and 12 weeks ago, using a 2-week best | `src/lib/domain/gain.ts` |
| Rotation and weekly splits; skip, swap and "make next"; finishing advances the split atomically | `src/lib/domain/split.ts`, SQL `get_today_for` / `finish_session` |
| Plate calculator | `src/lib/domain/plates.ts` |
| **Friends**: each friend's split day today and whether they've logged; add by code, **QR code** or share link; requests need accepting; sharing can be turned off | `src/app/friends`, `0002_friends.sql` |
| **Dashboard widgets**: toggle, reorder, half/full width, per-widget color | Settings → Dashboard widgets |
| **Themes**: 4 presets, color picker per variable, WCAG contrast check | `src/config/themes.ts` |
| JSON and CSV export, JSON import (local), reset with undo | Settings → Data |

### Design notes

- **"Today" is decided in one place.** In Supabase it is the SQL function `get_today()`; locally it is `getToday()` in `split.ts`, which mirrors that function. The bot and reminders should call the SQL function too.
- **Friends never read each other's tables.** `friends_today()` is a security-definer function that returns only display name, day name and set count for *accepted* friends. `get_today_for()` is not callable by clients. Row-level security is on every table.
- **Locked columns:** `users.discord_id` and `friend_code` can't be edited by clients, so nobody can claim someone else's Discord link.
- **Weights are stored in kg** and converted for display.

## Tested

- 33 unit tests (`npm test`) covering e1RM, shorthand, PR replay, split rotation and weekly timezone handling, progression, % gain, plates, streaks, exercise matching and config merging.
- Both migrations run on Postgres 16 with a stubbed Supabase `auth` schema. Checked: rotation advance and idempotent finish, skip, weekly-mode timezone, row-level security isolation between two users, the friend request → accept → status flow, hidden status, and locked columns.
- A headless browser run on a phone-sized viewport covered logging, PR badges, rest timer, shorthand and undo, finish advancing the split, demo history, charts, friends with QR, theme switching and widgets, with no console errors.
- **Not tested against a live Supabase project**, so the Discord OAuth round trip and Realtime have not been run.

## Offline logging

On the Supabase backend, the app keeps a copy of your workout data on the device (`src/lib/store/sync.ts`).

- **Online:** everything behaves as normal.
- **No signal:** starting a workout, logging, undo, finishing, skipping and swapping save on the phone. They sync in order when the connection returns. A banner shows what's waiting.
- **Opening the app with no signal:** a service worker (`public/sw.js`) lets the installed app open.
- **Needs a connection:** split editing, friends and reminders. They say so when you're offline.
- **Turning it off:** set `data.offline` (and `data.serviceWorker`) to `false`.
- **Debugging:** set `data.backend` to `"local-sync"` to run the same sync layer against a fake server in the browser, then toggle DevTools → Network → Offline.

## Discord bot

Slash commands are served by `src/app/api/discord/route.ts` (no separate bot process). Logic lives in `src/lib/bot/`; the server-only SQL functions are in `supabase/migrations/0003_bot.sql`.

Setup:
1. Run `0003_bot.sql` in the Supabase SQL editor.
2. In Vercel, set `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY` (Config) and `DISCORD_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` (Secret), then redeploy.
3. Open `https://<app>/api/discord`: every value under `configured` should be `true`.
4. Discord Developer Portal → General Information → **Interactions Endpoint URL** = `https://<app>/api/discord`, then save. Discord verifies it, and that verification also registers the commands. (Manual fallback: `https://<app>/api/discord?register=1`.)
5. Installation: enable Guild Install (scopes `applications.commands`, `bot`) and User Install (`applications.commands`), then use the install link.

Commands: `/today` `/log` `/undo` `/done` `/skip` `/swap` `/lift` `/streak` `/friends` `/plates` `/rest` `/announce`, with [Same again] / [Undo] buttons on `/log` and [Skip] on `/today`. Replies in servers are visible only to you (`bot.ephemeralInGuilds`).

### Reminders, daily check-in and PR announcements

- **Reminders** (Settings → Reminders): a DM at your time with today's split day and **Start workout / Rest day / Skip / Snooze** buttons. Not sent if you already trained that day, or on weekly rest days (`reminders.*` in config). If Discord refuses the DM, that reminder switches off and Settings explains why.
- **PR announcements**: run `/announce on` in a server channel and tick "Post my PRs" in Settings. PRs from the web app *and* Discord are posted there, once per set. The server re-checks every PR, so it can't be faked.

Setup:
1. Run `supabase/migrations/0004_reminders.sql`.
2. In Vercel, add `CRON_SECRET` (Secret, any long random string) and redeploy.
3. Copy `supabase/cron.sql.example`, put in your app URL and `CRON_SECRET`, and run it in the SQL editor. It schedules a call to `/api/cron/reminders` every minute via `pg_cron` + `pg_net`.

## To-do

See [TODO.md](TODO.md) for what's in progress (Discord bot), what's next and the idea backlog.
