-- Friend profiles, private nicknames for friends, and calorie intake.

-- ---------------------------------------------------------------- nicknames
-- Your own label for a friend. Only you see it; it doesn't change their name.
create table if not exists public.friend_nicknames (
  user_id   uuid not null default auth.uid() references public.users (id) on delete cascade,
  friend_id uuid not null references public.users (id) on delete cascade,
  nickname  text not null check (length(nickname) between 1 and 40),
  primary key (user_id, friend_id)
);
alter table public.friend_nicknames enable row level security;
create policy "own rows" on public.friend_nicknames for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- friends_today gains a nickname column. Changing a function's result columns
-- needs drop + create (the wrapper depends on the _for version).
drop function if exists public.friends_today(timestamptz);
drop function if exists public.friends_today_for(uuid, timestamptz);

create function public.friends_today_for(p_user uuid, p_now timestamptz default now())
returns table (
  friend_id       uuid,
  display_name    text,
  nickname        text,
  kind            text,
  day_name        text,
  logged_today    boolean,
  sets_today      int,
  last_session_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  r record;
  t record;
  v_done_day uuid;
begin
  for r in
    select u.id, u.display_name, u.timezone, u.share_status, n.nickname as nick
    from public.friendships f
    join public.users u on u.id = case when f.requester_id = p_user then f.addressee_id else f.requester_id end
    left join public.friend_nicknames n on n.user_id = p_user and n.friend_id = u.id
    where f.status = 'accepted' and p_user in (f.requester_id, f.addressee_id)
  loop
    friend_id := r.id;
    display_name := r.display_name;
    nickname := r.nick;
    if not r.share_status then
      kind := 'hidden'; day_name := null; logged_today := null; sets_today := null; last_session_at := null;
      return next; continue;
    end if;

    select se.split_day_id into v_done_day from public.sessions se
      where se.user_id = r.id and se.split_day_id is not null
        and (se.started_at at time zone r.timezone)::date = (p_now at time zone r.timezone)::date
      order by se.started_at desc limit 1;
    if v_done_day is not null then
      kind := 'day';
      select name into day_name from public.split_days where id = v_done_day;
    else
      select * into t from public.get_today_for(r.id, p_now);
      kind := t.kind;
      select name into day_name from public.split_days where id = t.split_day_id;
    end if;

    select count(*)::int into sets_today
    from public.sets st join public.sessions se on se.id = st.session_id
    where se.user_id = r.id and not st.is_warmup
      and (se.started_at at time zone r.timezone)::date = (p_now at time zone r.timezone)::date;
    logged_today := sets_today > 0;

    select max(started_at) into last_session_at from public.sessions where user_id = r.id;
    return next;
  end loop;
end $$;

create function public.friends_today(p_now timestamptz default now())
returns table (
  friend_id uuid, display_name text, nickname text, kind text, day_name text,
  logged_today boolean, sets_today int, last_session_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select * from public.friends_today_for(auth.uid(), p_now);
$$;

revoke execute on function public.friends_today_for(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.friends_today_for(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------- friend profile
-- What a friend sees on your profile: only for accepted friends, and only
-- your name if you've turned sharing off. Never raw sets.
create or replace function public.friend_profile_for(p_user uuid, p_friend uuid, p_now timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  u public.users;
  t record;
  v_today jsonb;
  v_local date;
begin
  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = p_user and addressee_id = p_friend) or (requester_id = p_friend and addressee_id = p_user))
  ) then
    return null;
  end if;

  select * into u from public.users where id = p_friend;
  if not u.share_status then
    return jsonb_build_object(
      'id', u.id, 'display_name', u.display_name, 'shared', false,
      'nickname', (select nickname from public.friend_nicknames where user_id = p_user and friend_id = p_friend));
  end if;

  v_local := (p_now at time zone u.timezone)::date;
  select * into t from public.friends_today_for(p_user, p_now) where friend_id = p_friend;

  return jsonb_build_object(
    'id', u.id,
    'display_name', u.display_name,
    'nickname', t.nickname,
    'shared', true,
    'unit', u.unit,
    'today', jsonb_build_object('kind', t.kind, 'day_name', t.day_name, 'sets_today', t.sets_today),
    'last_session_at', t.last_session_at,
    'sessions_this_week', (
      select count(*) from public.sessions
      where user_id = p_friend and finished_at is not null
        and (started_at at time zone u.timezone)::date >= date_trunc('week', v_local)::date),
    'sessions_30d', (
      select count(*) from public.sessions
      where user_id = p_friend and finished_at is not null and started_at >= p_now - interval '30 days'),
    'split_name', (select name from public.splits where user_id = p_friend and is_active),
    'recent_prs', coalesce((
      select jsonb_agg(x order by x.achieved_at desc) from (
        select e.name as exercise, pr.type, pr.weight, pr.reps, pr.value, pr.achieved_at
        from public.personal_records pr join public.exercises e on e.id = pr.exercise_id
        where pr.user_id = p_friend and not pr.baseline and pr.type in ('weight', 'e1rm')
        order by pr.achieved_at desc limit 6) x), '[]'::jsonb),
    'top_lifts', coalesce((
      select jsonb_agg(x order by x.e1rm desc) from (
        select e.name as exercise, max(pr.value) as e1rm
        from public.personal_records pr join public.exercises e on e.id = pr.exercise_id
        where pr.user_id = p_friend and pr.type = 'e1rm'
        group by e.name order by max(pr.value) desc limit 3) x), '[]'::jsonb)
  );
end $$;

create or replace function public.friend_profile(p_friend uuid, p_now timestamptz default now())
returns jsonb language sql stable security definer set search_path = public as $$
  select public.friend_profile_for(auth.uid(), p_friend, p_now);
$$;

revoke execute on function public.friend_profile_for(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.friend_profile_for(uuid, uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------- calories
create table if not exists public.nutrition_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.users (id) on delete cascade,
  date       date not null,              -- user's local date
  calories   int not null check (calories between 0 and 20000),
  protein_g  numeric check (protein_g >= 0),
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists nutrition_user_date on public.nutrition_entries (user_id, date);
alter table public.nutrition_entries enable row level security;
create policy "own rows" on public.nutrition_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.users
  add column if not exists calorie_target int,
  add column if not exists protein_target int;
grant update (calorie_target, protein_target) on public.users to authenticated;
