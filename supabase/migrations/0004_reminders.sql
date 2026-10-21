-- Reminders / daily check-in, opt-in PR announcements and account-level
-- preferences. Safe to run before anything is configured: nothing is sent
-- until the cron job in supabase/cron.sql.example is scheduled.

alter table public.reminders
  add column if not exists last_sent_on  date,        -- user's local date of the last send (one per day)
  add column if not exists snoozed_until timestamptz, -- set by the Snooze button
  add column if not exists last_error    text;        -- why the last DM failed (shown in Settings)

alter table public.users
  add column if not exists announce_channel_id text,                        -- set by /announce on (bot only)
  add column if not exists announce_prs        boolean not null default false,
  add column if not exists prefs               jsonb   not null default '{}'; -- theme + dashboard, synced across devices

grant update (announce_prs, prefs) on public.users to authenticated;

-- Each PR set is announced at most once (claimed atomically by the server).
alter table public.sets add column if not exists announced_at timestamptz;

-- Reminders due now. A reminder fires once per local day, inside a window
-- after its time (so a late or skipped cron tick still delivers it, but a
-- reminder is never sent hours late), or when its snooze has run out.
create or replace function public.due_reminders(p_now timestamptz default now(), p_window interval default interval '2 hours')
returns table (reminder_id uuid, user_id uuid, discord_id text, local_date date, snoozed boolean)
language sql stable security definer set search_path = public as $$
  select r.id, u.id, u.discord_id, (p_now at time zone u.timezone)::date, r.snoozed_until is not null
  from public.reminders r
  join public.users u on u.id = r.user_id
  where r.enabled
    and r.channel = 'discord'
    and u.discord_id is not null
    and (
      (r.snoozed_until is not null and r.snoozed_until <= p_now)
      or (
        r.snoozed_until is null
        and extract(dow from p_now at time zone u.timezone)::int = any (r.days)
        and (p_now at time zone u.timezone) >= ((p_now at time zone u.timezone)::date + r.local_time)
        and (p_now at time zone u.timezone) <  ((p_now at time zone u.timezone)::date + r.local_time + p_window)
        and (r.last_sent_on is null or r.last_sent_on < (p_now at time zone u.timezone)::date)
      )
    );
$$;

revoke execute on function public.due_reminders(timestamptz, interval) from public, anon, authenticated;
grant execute on function public.due_reminders(timestamptz, interval) to service_role;
