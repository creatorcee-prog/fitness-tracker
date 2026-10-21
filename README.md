# Garage Gym

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

## Friends, profiles and calories

- **Friends:** tap a friend to see their profile: today's day and whether they've logged, sessions this week, last workout, top lifts and recent PRs. If they turn sharing off, you only see their name. Profiles come from the `friend_profile()` SQL function, which returns this summary for accepted friends and never their raw sets.
- **Nicknames:** give any friend a nickname. Only you see it, and it's used in the app and in Discord `/friends`.
- **Calories:** the Calories card on Today logs intake with quick-add buttons and optional protein. It shows progress against your target (Settings → Nutrition) and the last 7 days.
- **Setup:** run `supabase/migrations/0005_profiles_nutrition.sql`.
- **Live updates:** run `supabase/migrations/0006_realtime_sets.sql` so sets logged from Discord show up in an open app without refreshing. The app also reloads whenever you switch back to it.

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

Commands: `/today` `/log` `/undo` `/done` `/skip` `/swap` `/lift` `/streak` `/friends` `/plates` `/rest` `/announce` `/goal` `/bodyweight` `/help`, with [Same again] / [Undo] buttons on `/log` and [Skip] on `/today`. Replies in servers are visible only to you (`bot.ephemeralInGuilds`).

### Reminders, daily check-in and PR announcements

- **Reminders** (Settings → Reminders): a DM at your time with today's split day and **Start workout / Rest day / Skip / Snooze** buttons. Not sent if you already trained that day, or on weekly rest days (`reminders.*` in config). If Discord refuses the DM, that reminder switches off and Settings explains why.
- **PR announcements**: run `/announce on` in a server channel and tick "Post my PRs" in Settings. PRs from the web app *and* Discord are posted there, once per set. The server re-checks every PR, so it can't be faked.

Setup:
1. Run `supabase/migrations/0004_reminders.sql`.
2. In Vercel, add `CRON_SECRET` (Secret, any long random string) and redeploy.
3. Turn on the `pg_cron` and `pg_net` extensions (Database → Extensions).
4. Copy `supabase/cron.sql.example`, put in your app URL and `CRON_SECRET`, and run it in the SQL editor. It schedules a call to `/api/cron/reminders` every minute. If you use the Integrations → Cron UI instead, set the timeout to about 15 s; pg_net's default of about 2 s is shorter than a cold Vercel start.

## AI coach: `/ask` (read-only) and plain-text `/log`

- **`/log`** takes plain text (`4x8 bench 185`, `bench 185 4x8`, `squat 3x5 @ 225`, `deadlift 405x3`, `bench 100kg 3x5`). It replies with what it understood and **Confirm / Cancel** buttons. Nothing is saved until Confirm. An unknown lift name gets a menu of best guesses. Parsing is `src/lib/domain/freetext.ts`, no AI.
- **`/ask question:`** gets a short answer from James (`src/lib/ai/`). Discord gets an immediate private "thinking…", then the answer arrives after the response is sent.
  - **What the model sees:** a training summary built on the server, under 2,500 tokens: today's split day, the last 5 sessions' top sets, recent PRs, goals and bodyweight trend. Your name and Discord ID aren't included. Each `/ask` stands alone.
  - **Read-only:** the model has no tools and never writes to the database. Text that looks like a set is pointed to `/log` without calling the model.
  - **Proposed changes (app chat only):** James can *propose* up to 3 changes from a fixed list (add a goal, change sets/reps on a split day, add or remove a lift on a day, calorie/protein target, unit, display name, weekly target, guided sets). They appear as cards with **Apply**. The server and browser both validate them, the card text is generated by the app (not the model), and Apply runs with your own login, with Undo. Lifts and days are matched by name, so the model never sees ids. See `src/lib/ai/actions.ts`. Discord `/ask` stays read-only. Costs up to `AI_ACTION_TOKENS` (200) extra output tokens per in-app question.
  - **Provider:** Groq's OpenAI-compatible API. `GROQ_MODEL` defaults to `openai/gpt-oss-120b` with low reasoning effort. `GROQ_FALLBACK_MODEL` is used on a 429.
  - **Limits:** `AI_DAILY_USER_LIMIT` (10) and `AI_DAILY_GLOBAL_LIMIT` (70) apply per UTC day. Usage is recorded in `ai_usage` from the API's `usage` field. Over a cap, or after a 429 with no fallback, you get a friendly "try again later".
  - **Developer accounts:** put app account IDs (Settings → Sign-in methods → Account ID) in `AI_DEV_USER_IDS` (comma-separated, a Vercel Secret or Config). They get `AI_DEV_DAILY_LIMIT` (200) a day instead, aren't blocked by the shared cap, and their use doesn't count toward it. Groq's own per-key limit still applies to everyone.
  - **Off switch:** `AI_ENABLED=false`, or no `GROQ_API_KEY`.
- **Setup:**
  1. Run `supabase/migrations/0007_ai_usage.sql`.
  2. Add `GROQ_API_KEY` to Vercel as a Secret, then redeploy.
  3. Save the Interactions Endpoint URL again (or open `/api/discord?register=1`) to register `/ask`.
  4. `GET /api/discord` shows the AI settings. It never shows the key.
- **Measured prompt size:** about 710 input tokens per `/ask` (system prompt about 207, training summary about 480, plus the question), using the o200k tokenizer on a 12-week PPL history. Output is capped at 500 tokens, reasoning included. That keeps 70 requests a day at about 85k tokens or less, under Groq's free 200K/day.
- **Sampling:** temperature 0.5, top_p 0.9, frequency_penalty 0.25 (`AI_TEMPERATURE`, `AI_TOP_P`, `AI_FREQUENCY_PENALTY`). If the model rejects one of these, the request is retried once without them.
- **Question length:** up to `AI_MAX_QUESTION_CHARS` (1,500 characters, about 375 tokens) in the app and in Discord `/ask`. Keep `ai.maxQuestionChars` in config the same. Pasted workout notes get a pointer to the Import page, which reads up to 8,000.
- **In-app chat:** the floating **Ask James** button opens a chat panel. It calls `/api/ask` with your Supabase session, and uses the same prompt, caps (shared with Discord) and usage tracking. The app can see your conversation, so the last `AI_CHAT_HISTORY_TURNS` exchanges (default 2) are included for follow-ups. That adds about 300–400 tokens; set it to 0 to turn it off. The chat is kept in the browser tab only. Hide the button with `ai.chatButton: false` in config.
- **No chat history in Discord:** each `/ask` stands alone. Slash commands don't see earlier messages, and the bot doesn't read channel messages (no Message Content intent). Check the current limits at https://console.groq.com/docs/rate-limits; they change.
- **Privacy:** `/privacy`, linked from Settings, explains what is sent to Groq.

## Goals and James (the mascot)

- **Goals** (Progress → Goals, plus a Today widget): est. 1RM for a lift, reps at a weight, or sessions per week. Progress is computed from your logged sets each time, never stored. Lift 1RM goals get a projected date from a straight-line fit of your weekly best e1RM over the last 8 weeks (`src/lib/domain/goals.ts`). It's an estimate and says so. `/goal` in Discord shows the same thing.
- **James** talks on the Today screen: greetings by time of day, session start, PRs, goals reached, streak milestones, and a nudge after `mascot.missedDays` days off. Lines are scripted, not AI (`src/lib/mascot/lines.ts`); add your own freely. One line at a time, and a PR or goal line isn't replaced by small talk for `mascot.holdMs`. Turn him off in Settings or with `mascot.enabled: false`.
- **Art:** `src/components/JamesSilhouette.tsx` is a placeholder silhouette with mood eyebrows. Swap in real art later with the same props. `public/james.png` (512×512) is the same art for the Discord bot avatar (Developer Portal → Bot → Icon).
- **Setup:** run `supabase/migrations/0008_goals.sql`, then open `/api/discord?register=1` to register `/goal`.

## Look, layout and habits

- **Themes:** Ember is the default. Every theme has a **dark and a light version**: Settings → Look & feel → Appearance → Dark (default), Light or **Follow my phone**. `src/config/themes.test.ts` checks every theme in both modes for WCAG AA contrast (4.5:1 text, 3:1 status colors). Add a theme by giving it `vars`, its `mode` and an `alt` (the other mode); the test tells you if something is unreadable.
- **Fonts:** Settings → Look & feel → Font, with 13 choices (System, Outfit, Inter, Manrope, DM Sans, Space Grotesk, Sora, Barlow, Rubik, Lexend, Atkinson Hyperlegible, JetBrains Mono, or the theme's own). Only the chosen font is downloaded; the picker previews fetch just the letters they show (`src/config/fonts.ts`).
- **Today:** on a training day (or mid-workout) the workout comes first and the widgets follow; rest days show widgets first (`dashboard.workoutFirst`). The chat button sits in Today's header, so nothing floats over the workout.
- **Touch targets:** 44px minimum (48px weight/reps buttons), following Apple's HIG and WCAG 2.5.5.
- **Settings** is grouped (You, Training, Look & feel, Reminders, Data) with a jump bar; debugging tools are under **Advanced**.
- **Streak freezes:** one is earned every 4 weeks on target (up to 2 saved) and covers a missed week instead of resetting the streak (`streak.*`). Research on streaks found intact streaks motivate and broken ones make people quit, so repairs soften that.
- **Rest timer:** sound and vibration switches in Settings → Training. iPhone web apps can't vibrate, so the timer also flashes.

## First sign-in setup

New accounts get a short setup with James (`src/components/Onboarding.tsx`). He asks, in his typed voice:
1. Your name.
2. What you're training for (Strength Builder, Bodybuilder, Calisthenics, Weight Loss, General Fitness, Runner, Swimmer, Cyclist, Athlete).
3. How often (Casual 1–2, Regular 3–4, Gym Rat 5–6, Every Day).
4. Experience.
5. lb/kg, plus optional height and weight. BMI is shown with its limit spelled out: it can't tell muscle from fat.
6. A plan: his starter pick for your answers (`src/lib/onboarding/templates.ts`), bring your own (Import), build it yourself, or keep your current split.
7. Linking Discord, if you signed in another way.

Answers set your weekly target, turn on guided sets for beginners, and go to James (app and Discord) so his advice fits. "Skip setup" is always there. Settings → You → **About you** edits the answers or redoes the setup. Run `supabase/migrations/0013_onboarding.sql`; before it's run, nobody is sent to setup.

The sign-in screen says it's **invite only for now** and that **more sign-in options are on the way**.

## Editable Today and custom widgets

- **Edit like Control Center:**
  - Press and hold any widget, or tap **Edit**, to enter edit mode. Widgets wiggle (a dashed outline with Reduce Motion).
  - Each widget gets **−** to remove (with Undo), **↑/↓** to move, and **½/Full** for size. You can also drag widgets around; ↑/↓ are the non-drag alternative WCAG 2.5.7 requires.
  - **+ Add** lists hidden widgets, ready-made **Layouts** (Lifter, Minimal, Nutrition, With friends), and **Make your own**.
  - The layout is saved to your account. Widgets that work on the tile itself: Calories (+ Add), Bodyweight (+ Log), Today (tap to jump to the workout).
- **Custom widgets** (HTML/CSS/JavaScript, like personal scripts on a wiki):
  - They run in `<iframe sandbox="allow-scripts">` with no same-origin. A CSP inside the frame blocks all network access, and the app's `frame-src 'self'` header stops a frame from navigating away. So a widget can **read a copy of your training data** but **can't reach the internet, your login, or the rest of the app**. That makes pasting someone else's widget safe from data theft.
  - API: `gg.onData(fn)` gives `{ unit, today, week, streak, recent, lifts, prs, bodyweight }` with no ids; `gg.open("/progress")` opens a page; `gg.resize()` fits the tile. Theme colours are CSS variables (`var(--accent)`, `var(--text)` …).
  - The editor shows a live preview and starts from a documented template. Code is capped at 20,000 characters. See `src/lib/widgets/sandbox.ts`.
- **Custom CSS:** Settings → Advanced. It's saved to your account; `@import`, external `url()`, `image-set()` and web addresses are removed (`src/lib/widgets/css.ts`).

## Bodyweight

Progress → **Bodyweight**, or `/bodyweight 182` in Discord (`/bodyweight` alone shows the trend). One entry per day; logging again replaces it. The headline numbers are the **7-day average** and a fitted **rate per week** over the last 4 weeks, not today vs yesterday (single weigh-ins swing with water and food). **Strength ÷ bodyweight** shows each lift's best est. 1RM over the last 6 weeks divided by your latest weight. No migration needed (`bodyweight_entries` exists since 0001). After deploying, open `/api/discord?register=1` to add `/bodyweight` and `/help`.

## Import

Settings → **Import** (`/import`), or **Import these** when you paste workout notes into the chat. One box takes anything: notes, a plan, cells copied from Google Sheets/Excel/Numbers (tab-separated), Strong/Hevy exports, or a CSV.

- **Readers first, James second.** `src/lib/import/read.ts` tries the built-in readers (free, exact): Strong/Hevy CSV, program tables (a day column and an exercise column, any delimiter), and dated notes. Only when they can't make sense of it (nothing read, or more than 30% left over) does the page send it to James (`/api/import`, up to `AI_IMPORT_MAX_CHARS`). The user is told when James read it, and can ask James to re-read anything the readers got wrong.
- **Questions instead of guesses** (`questions.ts`): a day code it can't expand ("RE"), an ambiguous "x2", or missing sets/reps become questions with quick answers. James is told to flag unclear terms the same way rather than guess.
- **Memory:** answers are saved per account (`import_memory`) and applied automatically next time (changeable). `import_hints()` shows the most common answer across users, only when 3+ people gave it, never anyone's workouts. Migration `0011_import_memory.sql`; without it, it just asks every time.
- **Editable preview:** every day and lift (name, sets, reps, start weight, remove) can be edited before saving. Sessions, lift matching, goals and every line not imported are listed.
- **Splits:** a written-out plan is kept as written (weekdays, start weights, notes like "30s"); otherwise the split is rebuilt from the workouts (`infer.ts`). Run `0010_split_start_weights.sql` to keep start weights and notes.
- **Photos and screenshots (test feature):** **📷 Photo or screenshot** on Import sends up to `AI_VISION_MAX_IMAGES` (2) photos, shrunk in the browser (longest side 1600 px, JPEG), to `GROQ_VISION_MODEL` (default `qwen/qwen3.8-27b`). It uses the same prompt, questions and editable preview, and James is told to list unreadable numbers instead of guessing. Groq's image models change often and some are "preview", so check console.groq.com/docs/vision and change `GROQ_VISION_MODEL` if it stops working. Set it to empty to turn photos off. Each image costs about 2K tokens.
- Nothing is saved until **Import**. Importing twice is safe (same date and time are skipped). PRs are rebuilt.

## Sign-in, photos and guided sets

- **Google sign-in:** create an OAuth client in Google Cloud (Web application; redirect URI = the callback URL shown in Supabase → Authentication → Sign In / Providers → Google), paste the client ID and secret there and enable it. Turn on **Manual linking** on the same page so Settings → Sign-in methods can link Discord to a Google account (the bot needs Discord linked). Same email on both is linked automatically by Supabase. Hide a button with `auth.providers` in config.
- **Profile photo and banner** (Settings → Profile): resized and cropped in the browser (256px photo, 1200×400 banner, JPEG), stored in `profile_media`, visible to you and accepted friends only.
- **Guided sets** (Settings → Logging, off by default): weight suggestions, the reason hint, and moving to the next exercise automatically. Off: the bar starts from last time's numbers.
- **Setup:** run `supabase/migrations/0009_google_photos.sql`.

## To-do

See [TODO.md](TODO.md) for what's in progress (Discord bot), what's next and the idea backlog.
