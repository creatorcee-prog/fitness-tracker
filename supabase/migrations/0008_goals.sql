-- Goals: the table exists since 0001; this adds what the Goals feature needs.
-- Progress is always computed from sets/sessions in the app, never stored.
alter table public.goals
  add column if not exists target_weight numeric,               -- kg; for "reps at a weight" goals
  add column if not exists achieved_at  timestamptz,            -- set once when first reached (for the celebration)
  add column if not exists created_at   timestamptz not null default now();
