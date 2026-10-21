-- Fitness tracker schema. Every user-owned table carries user_id and a
-- row-level security policy so a user can only ever touch their own rows.
-- Weights are stored in kg; the app converts for display.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- users
create table public.users (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default 'Lifter',
  unit          text not null default 'lb' check (unit in ('lb', 'kg')),
  timezone      text not null default 'UTC',
  discord_id    text unique,
  theme_id      text,
  behavior_mode text not null default 'professional' check (behavior_mode in ('professional', 'game')),
  created_at    timestamptz not null default now()
);

-- Discord login fills discord_id automatically.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, display_name, discord_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'Lifter'),
    case when new.raw_app_meta_data ->> 'provider' = 'discord' then new.raw_user_meta_data ->> 'provider_id' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------- lifting
create table public.exercises (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null default 'other' check (category in ('upper', 'lower', 'core', 'cardio', 'other')),
  equipment    text,
  increment_kg numeric,
  owner_id     uuid references public.users (id) on delete cascade -- null = shared library
);

create table public.splits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.users (id) on delete cascade,
  name       text not null,
  mode       text not null default 'rotation' check (mode in ('rotation', 'weekly')),
  is_active  boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index one_active_split_per_user on public.splits (user_id) where is_active;

create table public.split_days (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references public.users (id) on delete cascade,
  split_id uuid not null references public.splits (id) on delete cascade,
  position int not null,
  name     text not null,
  weekday  int check (weekday between 0 and 6), -- weekly mode only; 0 = Sunday
  unique (split_id, position)
);

create table public.split_day_exercises (
  user_id      uuid not null default auth.uid() references public.users (id) on delete cascade,
  split_day_id uuid not null references public.split_days (id) on delete cascade,
  exercise_id  uuid not null references public.exercises (id),
  "order"      int not null,
  target_sets  int not null default 3,
  rep_range    text not null default '5-8',
  primary key (split_day_id, "order")
);

-- The single source of truth for "today".
create table public.split_state (
  user_id           uuid primary key default auth.uid() references public.users (id) on delete cascade,
  split_id          uuid not null references public.splits (id) on delete cascade,
  next_position     int not null default 0,
  last_completed_at timestamptz
);

create table public.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.users (id) on delete cascade,
  split_day_id uuid references public.split_days (id) on delete set null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  source       text not null default 'web' check (source in ('web', 'discord'))
);
create index sessions_user_started on public.sessions (user_id, started_at);

create table public.sets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.users (id) on delete cascade,
  session_id  uuid not null references public.sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  set_index   int not null,
  weight      numeric not null, -- kg
  reps        int not null check (reps >= 0),
  rpe         numeric,
  is_warmup   boolean not null default false,
  e1rm        numeric,          -- kg, computed by the app with the configured formula
  note        text,
  created_at  timestamptz not null default now()
);
create index sets_user_exercise on public.sets (user_id, exercise_id, created_at);

create table public.personal_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  type        text not null check (type in ('weight', 'reps_at_weight', 'e1rm', 'session_volume')),
  value       numeric not null,
  set_id      uuid references public.sets (id) on delete cascade,
  session_id  uuid references public.sessions (id) on delete cascade,
  weight      numeric,
  reps        int,
  baseline    boolean not null default false,
  achieved_at timestamptz not null
);
create index personal_records_user_exercise on public.personal_records (user_id, exercise_id);

-- ---------------------------------------------------------------- v1+ (schema ready, UI later)
create table public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.users (id) on delete cascade,
  type         text not null check (type in ('lift_e1rm', 'lift_reps', 'sessions_per_week', 'bodyweight', 'walk_distance')),
  exercise_id  uuid references public.exercises (id),
  target_value numeric not null,
  deadline     date
);

create table public.reminders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.users (id) on delete cascade,
  channel    text not null check (channel in ('discord', 'push')),
  local_time time not null,
  days       int[] not null default '{0,1,2,3,4,5,6}',
  enabled    boolean not null default true
);

create table public.push_subscriptions (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references public.users (id) on delete cascade,
  endpoint text not null unique,
  keys     jsonb not null
);

create table public.bodyweight_entries (
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  date    date not null,
  weight  numeric not null, -- kg
  primary key (user_id, date)
);

create table public.mascot_lines (
  id            uuid primary key default gen_random_uuid(),
  event         text not null,
  behavior_mode text not null default 'game',
  text          text not null,
  weight        int not null default 1
);

create table public.walks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references public.users (id) on delete cascade,
  planned_route  jsonb,
  distance_m     numeric,
  recorded_track jsonb,
  source         text not null default 'planned' check (source in ('planned', 'live', 'strava')),
  created_at     timestamptz not null default now()
);

create table public.xp_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.users (id) on delete cascade,
  reason     text not null,
  amount     int not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
alter table public.users enable row level security;
create policy "own row" on public.users for all using (id = auth.uid()) with check (id = auth.uid());
-- discord_id is set only by the signup trigger (or a future server-side /link
-- flow); letting users edit it would let them claim someone else's Discord.
revoke insert, update on public.users from anon, authenticated;
grant update (display_name, unit, timezone, theme_id, behavior_mode) on public.users to authenticated;

alter table public.exercises enable row level security;
create policy "read library and own" on public.exercises for select using (owner_id is null or owner_id = auth.uid());
create policy "write own" on public.exercises for insert with check (owner_id = auth.uid());
create policy "update own" on public.exercises for update using (owner_id = auth.uid());
create policy "delete own" on public.exercises for delete using (owner_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['splits', 'split_days', 'split_day_exercises', 'split_state', 'sessions', 'sets',
                           'personal_records', 'goals', 'reminders', 'push_subscriptions', 'bodyweight_entries',
                           'walks', 'xp_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.mascot_lines enable row level security;
create policy "readable by signed-in users" on public.mascot_lines for select to authenticated using (true);

-- ---------------------------------------------------------------- split logic
-- get_today_for(): THE function that decides a user's split day. The web app, the
-- Discord bot and reminders all call it. Mirrors src/lib/domain/split.ts.
create or replace function public.get_today_for(p_user uuid, p_now timestamptz default now())
returns table (kind text, split_day_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  v_split  public.splits;
  v_state  public.split_state;
  v_tz     text;
  v_day_id uuid;
begin
  select * into v_split from public.splits where user_id = p_user and is_active;
  if not found or not exists (select 1 from public.split_days where split_id = v_split.id) then
    return query select 'no-split'::text, null::uuid; return;
  end if;

  if v_split.mode = 'weekly' then
    select timezone into v_tz from public.users where id = p_user;
    select id into v_day_id from public.split_days
      where split_id = v_split.id and weekday = extract(dow from p_now at time zone coalesce(v_tz, 'UTC'))::int
      order by position limit 1;
    if v_day_id is null then return query select 'rest'::text, null::uuid; return; end if;
    return query select 'day'::text, v_day_id; return;
  end if;

  select * into v_state from public.split_state where user_id = p_user and split_id = v_split.id;
  select id into v_day_id from public.split_days
    where split_id = v_split.id and position = coalesce(v_state.next_position, -1);
  if v_day_id is null then
    select id into v_day_id from public.split_days where split_id = v_split.id order by position limit 1;
  end if;
  return query select 'day'::text, v_day_id;
end $$;

-- Internal: callable only from other functions (friends_today), never directly.
revoke execute on function public.get_today_for(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.get_today(p_now timestamptz default now())
returns table (kind text, split_day_id uuid)
language sql stable security definer set search_path = public as $$
  select * from public.get_today_for(auth.uid(), p_now);
$$;

-- Position following p_position in the active split (wraps around).
create or replace function public.next_split_position(p_split_id uuid, p_position int)
returns int language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select position from public.split_days where split_id = p_split_id and position > p_position order by position limit 1),
    (select position from public.split_days where split_id = p_split_id order by position limit 1),
    0);
$$;

-- Finishes a session and advances the split in ONE transaction. The
-- "finished_at is null" guard makes it idempotent, so two clients can't double-advance.
create or replace function public.finish_session(p_session_id uuid, p_now timestamptz default now())
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_session public.sessions;
  v_split   public.splits;
  v_pos     int;
begin
  update public.sessions set finished_at = p_now
    where id = p_session_id and user_id = auth.uid() and finished_at is null
    returning * into v_session;
  if not found then return; end if;

  select * into v_split from public.splits where user_id = auth.uid() and is_active;
  if not found then return; end if;

  select position into v_pos from public.split_days where id = v_session.split_day_id and split_id = v_split.id;

  insert into public.split_state (user_id, split_id, next_position, last_completed_at)
  values (
    auth.uid(), v_split.id,
    case when v_split.mode = 'rotation' and v_pos is not null then public.next_split_position(v_split.id, v_pos) else 0 end,
    p_now)
  on conflict (user_id) do update set
    split_id = excluded.split_id,
    next_position = case when v_split.mode = 'rotation' and v_pos is not null
                         then excluded.next_position else public.split_state.next_position end,
    last_completed_at = p_now;
end $$;

-- Skip / swap: move the pointer without logging a session.
create or replace function public.set_next_position(p_position int)
returns void language plpgsql security invoker set search_path = public as $$
declare v_split_id uuid;
begin
  select id into v_split_id from public.splits where user_id = auth.uid() and is_active;
  if v_split_id is null then return; end if;
  insert into public.split_state (user_id, split_id, next_position)
  values (auth.uid(), v_split_id, p_position)
  on conflict (user_id) do update set split_id = excluded.split_id, next_position = excluded.next_position;
end $$;

-- Realtime: open tabs hear split_state changes.
alter publication supabase_realtime add table public.split_state;
