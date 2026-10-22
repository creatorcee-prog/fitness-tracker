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
