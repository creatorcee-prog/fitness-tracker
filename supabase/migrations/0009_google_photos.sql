-- Google sign-in (linking Discord later) and profile photos / banners.

-- ---------------------------------------------------------------- linked Discord
-- Someone who signs up with Google has no discord_id, so the bot can't find
-- them. When they link Discord (Settings → Sign-in methods), Supabase adds an
-- identity row; copy its Discord id onto their profile. Only this trigger and
-- the signup trigger ever set discord_id (users can't edit it themselves).
create or replace function public.handle_new_identity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.provider = 'discord' then
    update public.users u
      set discord_id = coalesce(new.identity_data ->> 'provider_id', new.identity_data ->> 'sub', new.provider_id)
      where u.id = new.user_id
        and u.discord_id is null
        -- never take a Discord id another account already has
        and not exists (
          select 1 from public.users o
          where o.discord_id = coalesce(new.identity_data ->> 'provider_id', new.identity_data ->> 'sub', new.provider_id)
        );
  end if;
  return new;
end $$;

drop trigger if exists on_auth_identity_created on auth.identities;
create trigger on_auth_identity_created after insert on auth.identities
  for each row execute function public.handle_new_identity();

-- ---------------------------------------------------------------- photos
-- Small images, resized in the browser before upload (avatar 256px, banner
-- 1200x400, JPEG), stored as data URLs. Simple and needs no Storage bucket;
-- fine for a friend group. Move to Supabase Storage if this ever gets big.
create table if not exists public.profile_media (
  user_id    uuid primary key default auth.uid() references public.users (id) on delete cascade,
  avatar     text check (avatar is null or (avatar like 'data:image/%' and length(avatar) < 200000)),
  banner     text check (banner is null or (banner like 'data:image/%' and length(banner) < 600000)),
  updated_at timestamptz not null default now()
);
alter table public.profile_media enable row level security;

-- You and your accepted friends can see your photos; only you can change them.
create policy "own or friends read" on public.profile_media for select using (
  user_id = auth.uid()
  or exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = profile_media.user_id)
        or (f.addressee_id = auth.uid() and f.requester_id = profile_media.user_id))
  )
);
create policy "own insert" on public.profile_media for insert with check (user_id = auth.uid());
create policy "own update" on public.profile_media for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own delete" on public.profile_media for delete using (user_id = auth.uid());
