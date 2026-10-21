# To-do

## In progress: Discord bot, round 1

Slash commands through `/api/discord` in the web app (no separate bot server).

- [ ] `/today`: today's split day, exercises, targets and last time's numbers (**[Skip]** button)
- [ ] `/log bench 185x5x3`: same shorthand and aliases as the app, flags PRs (**[Same again]** / **[Undo]** buttons)
- [ ] `/undo`: remove the last logged set
- [ ] `/done`: finish the workout, advance the split, post a summary
- [ ] `/skip`: skip today's day (rotation mode)
- [ ] `/swap <day>`: do a different day today (autocomplete)
- [ ] `/lift <name>`: last session, records and % gain for one lift (autocomplete)
- [ ] `/streak`: sessions this week and weekly streak
- [ ] `/friends`: who's lifted today
- [ ] `/plates 225`: plates per side (works without an account)
- [ ] `/rest 2m`: live countdown message
- [ ] SQL: server-only `*_for(user)` versions of today/finish/skip for the bot

## Next: Discord bot, round 2 (needs scheduled jobs)

- [ ] Reminders (Supabase Cron, user's local time, skip if already trained)
- [ ] Daily check-in DM with **Start / Rest day / Skip** buttons
- [ ] Opt-in PR announcements in a server channel
- [ ] `/goal` (after goals exist in the app)

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
