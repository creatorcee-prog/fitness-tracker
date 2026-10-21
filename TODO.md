# To-do

## Done: Discord bot, round 1 (built; needs live testing in Discord)

Slash commands through `/api/discord` in the web app (no separate bot server).

- [x] `/today`: today's split day, exercises, targets and last time's numbers (**[Skip]** button)
- [x] `/log bench 185x5x3`: same shorthand and aliases as the app, flags PRs (**[Same again]** / **[Undo]** buttons)
- [x] `/undo`: remove the last logged set
- [x] `/done`: finish the workout, advance the split, post a summary
- [x] `/skip`: skip today's day (rotation mode)
- [x] `/swap <day>`: do a different day today (autocomplete)
- [x] `/lift <name>`: last session, records and % gain for one lift (autocomplete)
- [x] `/streak`: sessions this week and weekly streak
- [x] `/friends`: who's lifted today
- [x] `/plates 225`: plates per side (works without an account)
- [x] `/rest 2m`: live countdown message
- [x] SQL: server-only `*_for(user)` versions of today/finish/skip for the bot

## Done: Discord bot, round 2 (built; needs live testing)

- [x] Reminders (Supabase Cron → `/api/cron/reminders`, user's local time, skip if already trained / rest day)
- [x] Daily check-in DM with **Start workout / Rest day / Skip / Snooze** buttons
- [x] Failed DMs switch the reminder off with an explanation in Settings
- [x] Opt-in PR announcements in a server channel (`/announce on|off`, web + Discord PRs, once per set)

## Queued (requested)

- [x] App Store polish pass: iOS typography and spacing, week strip on Today, stat cards with progress bars, iOS segmented controls, press feedback, theme swatches, new presets (Neon, Tactical, Aurora Glass, Ice) and a **Glass** option
- [x] Friend profiles: tap a friend to see today, sessions this week, last workout, top lifts and recent PRs (only name if they don't share)
- [x] Custom nicknames for friends (private to you; also used by Discord `/friends`)
- [x] Calorie intake: daily log with quick-add, optional protein, targets in Settings, 7-day view on the Today card
- [ ] Ideas: `/food 650` in Discord, food logging offline, weekly calorie average on Progress

## Done: AI `/ask` + plain-text `/log` with Confirm (needs a Groq key to go live)

- [x] Plain-text `/log` parser + Confirm/Cancel + lift picker menu
- [x] `/ask` read-only coach (Groq, deferred ephemeral reply, fallback model on 429, daily caps, `ai_usage`, kill switch)
- [x] Privacy page
- [ ] Live test with a real `GROQ_API_KEY`; record real tokens per `/ask` (logged as `[ask] outcome=… in=… out=…` in Vercel logs)

## Done: goals + James

- [x] Goals (e1RM, reps at weight, sessions/week) with progress bars and projected dates; Today widget; `/goal`
- [x] James mascot with scripted lines, moods and a placeholder silhouette
- [ ] Real James art (keep `JamesSilhouette` props)

## Done: import, account changes, Google, photos

- [x] Import old workouts (Strong/Hevy CSV, notes, or James), split rebuilt faithfully, goals
- [x] James proposes account changes in the app chat (Apply / Undo)
- [x] Google sign-in + link Discord
- [x] Profile photos and banners
- [x] Guided sets optional (off by default)
- [ ] Live test: Google provider + manual linking in Supabase; a real James import

## Done: import UX

- [x] One box for anything (incl. copied spreadsheet cells); readers first, James automatically if needed
- [x] Questions instead of guesses, remembered per user, common answers as hints (3+ users)
- [x] Editable import preview; "Import these" from chat
- [x] Photo/screenshot import (test feature, GROQ_VISION_MODEL)
- [ ] Test photo import accuracy with real photos (notebook, Notes screenshot, spreadsheet screenshot)

## Next

- [ ] Web push reminders (needs Home Screen install on iPhone)

## Later: bot ideas

- [x] `/bodyweight 182` + bodyweight card on Progress (7-day average, weekly rate, strength ÷ bodyweight)
- [ ] `/leaderboard`: compare friends. Needs an **explicit opt-in** per user, and per-lift choices of what to share (e.g. e1RM only, or % gain only, which is fairer across sizes).
- [x] `/help`

## Done: look and feel

- [x] Professional layout style (Pro Dark / Pro Light presets, or force it with Settings → Layout style)
- [x] Line icons instead of emoji in the nav

## Roadmap (from the build plan)

- v1: ~~goals~~, ~~talking mascot~~, ~~offline logging~~, ~~streak milestones for the mascot~~, bodyweight log
- v2: behavior modes (game / professional), walk planner, stall detection
- Later: Strava import

## Known gaps

- [x] Dashboard widget layout and theme are saved to the account (Supabase)
- [ ] `saveSplit` on Supabase runs several requests instead of one transaction
- [x] Offline logging (device mirror + outbox) and a service worker so the app opens offline
- [x] Import of local-mode JSON exports into Supabase
