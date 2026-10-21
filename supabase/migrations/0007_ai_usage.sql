-- AI /ask usage, for daily caps and cost visibility. Filled by the server from
-- the provider's `usage` field; users can read their own rows, only the
-- server (service role) writes.
create table if not exists public.ai_usage (
  user_id       uuid not null references public.users (id) on delete cascade,
  date          date not null, -- UTC day
  request_count int  not null default 0,
  tokens_in     int  not null default 0,
  tokens_out    int  not null default 0,
  primary key (user_id, date)
);
alter table public.ai_usage enable row level security;
create policy "read own" on public.ai_usage for select using (user_id = auth.uid());

-- Atomic increment (two /ask calls at once can't lose a count).
create or replace function public.ai_usage_record(p_user uuid, p_date date, p_in int, p_out int)
returns void language sql security definer set search_path = public as $$
  insert into public.ai_usage (user_id, date, request_count, tokens_in, tokens_out)
  values (p_user, p_date, 1, greatest(p_in, 0), greatest(p_out, 0))
  on conflict (user_id, date) do update set
    request_count = public.ai_usage.request_count + 1,
    tokens_in     = public.ai_usage.tokens_in + excluded.tokens_in,
    tokens_out    = public.ai_usage.tokens_out + excluded.tokens_out;
$$;

-- Today's request counts for one user and for everyone (global cap).
create or replace function public.ai_usage_check(p_user uuid, p_date date)
returns table (user_requests int, global_requests int)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select request_count from public.ai_usage where user_id = p_user and date = p_date), 0),
    coalesce((select sum(request_count)::int from public.ai_usage where date = p_date), 0);
$$;

revoke execute on function public.ai_usage_record(uuid, date, int, int) from public, anon, authenticated;
revoke execute on function public.ai_usage_check(uuid, date) from public, anon, authenticated;
grant execute on function public.ai_usage_record(uuid, date, int, int) to service_role;
grant execute on function public.ai_usage_check(uuid, date) to service_role;
