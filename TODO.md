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
- [ ] Friend profiles: tap a friend to see their split, streak and recent PRs (respecting their sharing setting)
- [ ] Custom nicknames for friends
- [ ] Calorie intake: daily log, target, dashboard widget

## Next milestone (gated): AI `/ask` + plain-text `/log` with Confirm

Spec: free-text set logging with a Confirm/Cancel step, plus a read-only `/ask` coach on Groq's free tier (`GROQ_MODEL`, `GROQ_FALLBACK_MODEL`, `AI_DAILY_USER_LIMIT=10`, `AI_DAILY_GLOBAL_LIMIT=70`, `AI_ENABLED`), with an `ai_usage` table, deferred ephemeral replies and a privacy note.
**Gate:** start only after set logging, PR detection and split sync are confirmed end to end in both the web app and Discord (live test of PR #2 setup).

## Next

- [ ] `/goal` (after goals exist in the app)
- [ ] Web push reminders (needs Home Screen install on iPhone)

## Later: bot ideas

- [ ] `/bodyweight 182`: log bodyweight. Build together with a **bodyweight page** in the app (chart plus relative strength, e1RM ÷ bodyweight) so the data is visible.
- [ ] `/leaderboard`: compare friends. Needs an **explicit opt-in** per user, and per-lift choices of what to share (e.g. e1RM only, or % gain only, which is fairer across sizes).
- [ ] `/help`: short guide to shorthand (`185x5x3`, `185 5,5,4`, aliases), linking accounts and where to find the app. Discord already lists commands when typing `/`, so this should explain *how*, not just *what*.

## Done: look and feel

- [x] Professional layout style (Pro Dark / Pro Light presets, or force it with Settings → Layout style)
- [x] Line icons instead of emoji in the nav

## Roadmap (from the build plan)

- v1: goals, talking mascot, offline logging (IndexedDB queue), bodyweight log, streak milestones for the mascot
- v2: behavior modes (game / professional), walk planner, stall detection
- Later: Strava import

## Known gaps

- [x] Dashboard widget layout and theme are saved to the account (Supabase)
- [ ] `saveSplit` on Supabase runs several requests instead of one transaction
- [x] Offline logging (device mirror + outbox) and a service worker so the app opens offline
- [x] Import of local-mode JSON exports into Supabase
