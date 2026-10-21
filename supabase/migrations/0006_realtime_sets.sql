-- Let open web tabs hear sets and sessions logged elsewhere (e.g. Discord /log),
-- so the app updates without a manual refresh. Realtime applies RLS, so each
-- user only receives their own rows.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sets') then
    alter publication supabase_realtime add table public.sets;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions') then
    alter publication supabase_realtime add table public.sessions;
  end if;
end $$;
