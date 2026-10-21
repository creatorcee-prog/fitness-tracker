-- Friends leaderboard: % strength gain, opt-in.
--
-- Score = average % gain in best estimated 1RM per lift, comparing the last
-- 4 weeks with weeks 8–12 ago (lifts with data in both windows). % gain is
-- fair across body sizes; raw weight would always favour the biggest person.
-- Only you and accepted friends who opted in appear, and only the
-- percentages leave the database (no sets, weights or dates).

alter table public.users add column if not exists leaderboard boolean not null default false;
grant update (leaderboard) on public.users to authenticated;

create or replace function public.leaderboard_for(p_user uuid, p_now timestamptz default now())
returns table (user_id uuid, display_name text, nickname text, is_you boolean, lifts int, avg_gain numeric, top_lift text, top_gain numeric)
language sql stable security definer set search_path = public as $$
  with people as (
    select p_user as id
    union
    select case when f.requester_id = p_user then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted' and p_user in (f.requester_id, f.addressee_id)
  ),
  opted as (
    select u.id, u.display_name from public.users u join people p on p.id = u.id where u.leaderboard
  ),
  e1rm as (
    -- Epley, warm-ups and sets over 10 reps excluded (same rules as the app's PRs).
    select s.user_id, s.exercise_id, s.created_at, s.weight * (1 + s.reps / 30.0) as v
    from public.sets s join opted o on o.id = s.user_id
    where not s.is_warmup and s.reps between 1 and 10 and s.weight > 0
      and s.created_at > p_now - interval '84 days'
  ),
  per_lift as (
    select user_id, exercise_id,
      max(v) filter (where created_at > p_now - interval '28 days') as cur,
      max(v) filter (where created_at <= p_now - interval '56 days') as base
    from e1rm group by user_id, exercise_id
  ),
  gains as (
    select pl.user_id, e.name, (pl.cur / pl.base - 1) * 100 as gain
    from per_lift pl join public.exercises e on e.id = pl.exercise_id
    where pl.cur is not null and pl.base is not null and pl.base > 0
  )
  select o.id, o.display_name, n.nickname, o.id = p_user,
    count(g.gain)::int,
    round(avg(g.gain)::numeric, 1),
    (array_agg(g.name order by g.gain desc))[1],
    round(max(g.gain)::numeric, 1)
  from opted o
  left join gains g on g.user_id = o.id
  left join public.friend_nicknames n on n.user_id = p_user and n.friend_id = o.id
  group by o.id, o.display_name, n.nickname
  order by avg(g.gain) desc nulls last;
$$;

create or replace function public.leaderboard(p_now timestamptz default now())
returns table (user_id uuid, display_name text, nickname text, is_you boolean, lifts int, avg_gain numeric, top_lift text, top_gain numeric)
language sql stable security definer set search_path = public as $$
  select * from public.leaderboard_for(auth.uid(), p_now);
$$;

revoke execute on function public.leaderboard_for(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.leaderboard_for(uuid, timestamptz) to service_role;
grant execute on function public.leaderboard(timestamptz) to authenticated;
