-- The exercise library now lives in supabase/migrations/0012_exercise_library.sql
-- (generated from src/lib/domain/library.ts), which is safe to run more than once.
-- This file used to insert the library without that protection; running it twice
-- created duplicates, which 0012 merges. Nothing to run here any more.
select 'Run supabase/migrations/0012_exercise_library.sql instead' as note;
