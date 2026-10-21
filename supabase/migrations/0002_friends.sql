-- Friends: see which split day accepted friends are on and whether they've
-- logged a lift today. Friends never read each other's tables directly; the
-- security-definer function friends_today() returns only that summary.

alter table public.users
  add column friend_code  text unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  add column share_status boolean not null default true;

-- friend_code stays server-assigned; share_status is user-editable.
grant update (share_status) on public.users to authenticated;

create table public.friendships (
  requester_id uuid not null references public.users (id) on delete cascade,
  addressee_id uuid not null references public.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

alter table public.friendships enable row level security;
create policy "participants read" on public.friendships for select
  using (auth.uid() in (requester_id, addressee_id));
create policy "addressee accepts" on public.friendships for update
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
create policy "either side removes" on public.friendships for delete
  using (auth.uid() in (requester_id, addressee_id));
-- Inserts go through send_friend_request() so the code lookup stays server-side.

create or replace function public.send_friend_request(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_target uuid;
begin
  select id into v_target from public.users where friend_code = upper(trim(p_code));
  if v_target is null then return 'not-found'; end if;
  if v_target = auth.uid() then return 'self'; end if;
  -- If they already asked us, accept instead of creating a second row.
  update public.friendships set status = 'accepted'
    where requester_id = v_target and addressee_id = auth.uid();
  if found then return 'accepted'; end if;
  insert into public.friendships (requester_id, addressee_id) values (auth.uid(), v_target)
    on conflict do nothing;
  return 'sent';
end $$;

-- Pending requests sent to me, with the requester's name (users rows are otherwise private).
create or replace function public.incoming_friend_requests()
returns table (requester_id uuid, display_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.requester_id, u.display_name, f.created_at
  from public.friendships f join public.users u on u.id = f.requester_id
  where f.addressee_id = auth.uid() and f.status = 'pending';
$$;

-- One row per accepted friend: today's split day and whether they've lifted.
create or replace function public.friends_today(p_now timestamptz default now())
returns table (
  friend_id       uuid,
  display_name    text,
  kind            text,    -- day | rest | no-split | hidden
  day_name        text,
  logged_today    boolean, -- at least one working set in a session started today (friend's timezone)
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
    select u.id, u.display_name, u.timezone, u.share_status
    from public.friendships f
    join public.users u on u.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    where f.status = 'accepted' and auth.uid() in (f.requester_id, f.addressee_id)
  loop
    friend_id := r.id;
    display_name := r.display_name;
    if not r.share_status then
      kind := 'hidden'; day_name := null; logged_today := null; sets_today := null; last_session_at := null;
      return next; continue;
    end if;

    -- If they already trained today, show the day they did (in rotation mode
    -- finishing advances the pointer, so get_today would show tomorrow's day).
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
