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

## Next

- [ ] `/goal` (after goals exist in the app)
- [ ] Web push reminders (needs Home Screen install on iPhone)

## Later: bot ideas

- [ ] `/bodyweight 182`: log bodyweight. Build together with a **bodyweight page** in the app (chart plus relative strength, e1RM ÷ bodyweight) so the data is visible.
- [ ] `/leaderboard`: compare friends. Needs an **explicit opt-in** per user, and per-lift choices of what to share (e.g. e1RM only, or % gain only, which is fairer across sizes).
- [ ] `/help`: short guide to shorthand (`185x5x3`, `185 5,5,4`, aliases), linking accounts and where to find the app. Discord already lists commands when typing `/`, so this should explain *how*, not just *what*.

## Roadmap (from the build plan)

- v1: goals, talking mascot, offline logging (IndexedDB queue), bodyweight log, streak milestones for the mascot
- v2: behavior modes (game / professional), walk planner, stall detection
- Later: Strava import

## Known gaps

- [ ] Dashboard widget layout and theme are saved per browser, not per account
- [ ] `saveSplit` on Supabase runs several requests instead of one transaction
- [ ] No service worker yet (installable, but no offline support)
- [ ] Import of local-mode JSON exports into Supabase
