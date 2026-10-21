-- Import answers: remembered per user, and summarised across users as hints.
-- Only short answers to import questions are stored (what a code like "RE"
-- or a detail like "x2" means), never workout data.
create table if not exists public.import_memory (
  user_id    uuid not null default auth.uid() references public.users (id) on delete cascade,
  key        text not null check (length(key) <= 60),   -- "term:re", "detail:x2", "setsreps"
  value      text not null check (length(value) <= 40), -- "Recovery", "pair", "3x8-12"
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.import_memory enable row level security;
create policy "own rows" on public.import_memory for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- "Most people answered…": the most common answer per key, only when at least
-- p_min_users different people gave it, so no single person's answer is exposed.
create or replace function public.import_hints(p_keys text[], p_min_users int default 3)
returns table (key text, value text, users int)
language sql stable security definer set search_path = public as $$
  select distinct on (m.key) m.key, m.value, count(*)::int as users
  from public.import_memory m
  where m.key = any (p_keys)
  group by m.key, m.value
  having count(*) >= greatest(p_min_users, 3)
  order by m.key, count(*) desc
$$;
revoke all on function public.import_hints(text[], int) from public, anon;
grant execute on function public.import_hints(text[], int) to authenticated;
