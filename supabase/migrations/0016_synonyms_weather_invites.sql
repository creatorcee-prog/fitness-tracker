-- #16: learned synonyms, weather nudges, invite nudges. Safe to run twice.

---------------------------------------------------------------------------
-- Synonyms that learn
---------------------------------------------------------------------------

-- Corrections: "when I typed X, I meant lift Y" (picking a lift after a name
-- didn't match, or "same as" in Import). One answer per person per name.
-- Your own corrections apply to you right away; a library lift's synonym
-- applies to everyone once 3+ people agree (see learned_aliases_for).
create table if not exists public.exercise_alias_votes (
  user_id     uuid not null default auth.uid() references public.users (id) on delete cascade,
  alias       text not null check (length(alias) between 2 and 60), -- lowercased, normalised
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, alias)
);
alter table public.exercise_alias_votes enable row level security;
drop policy if exists "own rows" on public.exercise_alias_votes;
create policy "own rows" on public.exercise_alias_votes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Synonyms the app owner approved on the review page (/dev/synonyms): for everyone.
-- Written only by the server (service role) after checking the owner.
create table if not exists public.exercise_aliases_approved (
  alias       text primary key check (length(alias) between 2 and 60),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  source      text not null default 'review', -- 'review' | 'ai' | 'votes'
  approved_at timestamptz not null default now()
);
alter table public.exercise_aliases_approved enable row level security;

-- Turned down on the review page, so they aren't suggested or auto-applied again.
create table if not exists public.exercise_aliases_rejected (
  alias       text not null,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  primary key (alias, exercise_id)
);
alter table public.exercise_aliases_rejected enable row level security;

-- Names that matched nothing, for the review page. Counts only: no user ids.
create table if not exists public.exercise_name_misses (
  name      text primary key check (length(name) between 2 and 60),
  times     int not null default 1,
  last_seen timestamptz not null default now()
);
alter table public.exercise_name_misses enable row level security;

create or replace function public.record_name_miss(p_name text)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.exercise_name_misses (name) values (left(lower(trim(p_name)), 60))
  on conflict (name) do update set times = exercise_name_misses.times + 1, last_seen = now();
$$;
revoke all on function public.record_name_miss(text) from public, anon;
grant execute on function public.record_name_miss(text) to authenticated, service_role;

-- Every extra synonym that applies to this user: their own corrections, the
-- owner-approved list, and library synonyms 3+ people agree on (the most
-- common answer for that name, unless it was rejected).
create or replace function public.learned_aliases_for(p_user uuid, p_min_users int default 3)
returns table (alias text, exercise_id uuid, source text)
language sql stable security definer set search_path = public as $$
  select v.alias, v.exercise_id, 'you'::text from public.exercise_alias_votes v where v.user_id = p_user
  union all
  select a.alias, a.exercise_id, 'approved' from public.exercise_aliases_approved a
  union all
  select c.alias, c.exercise_id, 'community' from (
    select distinct on (v.alias) v.alias, v.exercise_id, count(*) as n
    from public.exercise_alias_votes v join public.exercises e on e.id = v.exercise_id and e.owner_id is null
    group by v.alias, v.exercise_id
    order by v.alias, count(*) desc
  ) c
  where c.n >= greatest(p_min_users, 3)
    and not exists (select 1 from public.exercise_aliases_rejected r where r.alias = c.alias and r.exercise_id = c.exercise_id)
    and not exists (select 1 from public.exercise_aliases_approved a where a.alias = c.alias);
$$;
create or replace function public.learned_aliases()
returns table (alias text, exercise_id uuid, source text)
language sql stable security definer set search_path = public as $$
  select * from public.learned_aliases_for(auth.uid());
$$;
revoke all on function public.learned_aliases_for(uuid, int) from public, anon, authenticated;
grant execute on function public.learned_aliases_for(uuid, int) to service_role;
grant execute on function public.learned_aliases() to authenticated;

---------------------------------------------------------------------------
-- Weather nudges (opt-in). Location is rounded to ~1 km by the app.
---------------------------------------------------------------------------
alter table public.users add column if not exists weather_on    boolean not null default false;
alter table public.users add column if not exists weather_lat   numeric check (weather_lat between -90 and 90);
alter table public.users add column if not exists weather_lon   numeric check (weather_lon between -180 and 180);
alter table public.users add column if not exists weather_place text check (length(weather_place) <= 120);
grant update (weather_on, weather_lat, weather_lon, weather_place) on public.users to authenticated;

---------------------------------------------------------------------------
-- Invites. James (rules in the app, not the AI and not a person) asks active
-- lifters with few friends to share their link, at most once a month, and
-- you can switch it off. Nobody gets a view of who's friends with whom.
---------------------------------------------------------------------------
alter table public.users add column if not exists invite_nudges    boolean not null default true;
alter table public.users add column if not exists invite_nudged_at timestamptz;
-- Who brought this account in (set once, by claim_invite, never by the client directly).
alter table public.users add column if not exists invited_by uuid references public.users (id) on delete set null;
grant update (invite_nudges, invite_nudged_at) on public.users to authenticated;

-- Called when someone opens an invite link. Credits the inviter only for a
-- brand-new account (created in the last 7 days), only once, never yourself.
create or replace function public.claim_invite(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_inviter uuid;
begin
  select id into v_inviter from public.users where friend_code = upper(trim(p_code));
  if v_inviter is null or v_inviter = auth.uid() then return false; end if;
  update public.users set invited_by = v_inviter
    where id = auth.uid() and invited_by is null and created_at > now() - interval '7 days';
  return found;
end $$;
revoke all on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

-- How many people each of these accounts brought in. Only for yourself and
-- accepted friends (for the badge on their profile); a count, nothing else.
create or replace function public.recruit_counts(p_ids uuid[])
returns table (user_id uuid, recruits int)
language sql stable security definer set search_path = public as $$
  select x.id, (select count(*)::int from public.users r where r.invited_by = x.id)
  from unnest(p_ids) as x(id)
  where x.id = auth.uid()
     or exists (select 1 from public.friendships f where f.status = 'accepted'
                and ((f.requester_id = auth.uid() and f.addressee_id = x.id) or (f.addressee_id = auth.uid() and f.requester_id = x.id)));
$$;
revoke all on function public.recruit_counts(uuid[]) from public, anon;
grant execute on function public.recruit_counts(uuid[]) to authenticated;
