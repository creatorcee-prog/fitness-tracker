-- Discord bot support. The bot has no user session, so it calls *_for(p_user)
-- versions of the split functions with the service-role key. The functions
-- the web app calls become thin wrappers around them, so the logic for
-- "finish" and "friends" exists exactly once.

-- ---------------------------------------------------------------- finish
create or replace function public.finish_session_for(p_user uuid, p_session_id uuid, p_now timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions;
  v_split   public.splits;
  v_pos     int;
begin
  update public.sessions set finished_at = p_now
    where id = p_session_id and user_id = p_user and finished_at is null
    returning * into v_session;
  if not found then return; end if;

  select * into v_split from public.splits where user_id = p_user and is_active;
  if not found then return; end if;

  select position into v_pos from public.split_days where id = v_session.split_day_id and split_id = v_split.id;

  insert into public.split_state (user_id, split_id, next_position, last_completed_at)
  values (
    p_user, v_split.id,
    case when v_split.mode = 'rotation' and v_pos is not null then public.next_split_position(v_split.id, v_pos) else 0 end,
    p_now)
  on conflict (user_id) do update set
    split_id = excluded.split_id,
    next_position = case when v_split.mode = 'rotation' and v_pos is not null
                         then excluded.next_position else public.split_state.next_position end,
    last_completed_at = p_now;
end $$;

create or replace function public.finish_session(p_session_id uuid, p_now timestamptz default now())
returns void language sql security definer set search_path = public as $$
  select public.finish_session_for(auth.uid(), p_session_id, p_now);
$$;

-- ---------------------------------------------------------------- skip / swap
create or replace function public.set_next_position_for(p_user uuid, p_position int)
returns void language plpgsql security definer set search_path = public as $$
declare v_split_id uuid;
begin
  select id into v_split_id from public.splits where user_id = p_user and is_active;
  if v_split_id is null then return; end if;
  insert into public.split_state (user_id, split_id, next_position)
  values (p_user, v_split_id, p_position)
  on conflict (user_id) do update set split_id = excluded.split_id, next_position = excluded.next_position;
end $$;

create or replace function public.set_next_position(p_position int)
returns void language sql security definer set search_path = public as $$
  select public.set_next_position_for(auth.uid(), p_position);
$$;

-- ---------------------------------------------------------------- friends
create or replace function public.friends_today_for(p_user uuid, p_now timestamptz default now())
returns table (
  friend_id       uuid,
  display_name    text,
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
    select u.id, u.display_name, u.timezone, u.share_status
    from public.friendships f
    join public.users u on u.id = case when f.requester_id = p_user then f.addressee_id else f.requester_id end
    where f.status = 'accepted' and p_user in (f.requester_id, f.addressee_id)
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

create or replace function public.friends_today(p_now timestamptz default now())
returns table (
  friend_id uuid, display_name text, kind text, day_name text,
  logged_today boolean, sets_today int, last_session_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select * from public.friends_today_for(auth.uid(), p_now);
$$;

-- ---------------------------------------------------------------- access
-- *_for functions act on any user, so only the server (service role) may call them.
revoke execute on function public.finish_session_for(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.set_next_position_for(uuid, int) from public, anon, authenticated;
revoke execute on function public.friends_today_for(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_today_for(uuid, timestamptz) to service_role;
grant execute on function public.finish_session_for(uuid, uuid, timestamptz) to service_role;
grant execute on function public.set_next_position_for(uuid, int) to service_role;
grant execute on function public.friends_today_for(uuid, timestamptz) to service_role;
