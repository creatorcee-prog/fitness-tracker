-- Optional per-exercise extras in a split, from imported programs:
-- a starting weight (used for the first suggestion before any history)
-- and a short note ("30s", "x2 dumbbells").
alter table public.split_day_exercises
  add column if not exists start_weight numeric,                                           -- kg
  add column if not exists note         text check (note is null or length(note) <= 80);
