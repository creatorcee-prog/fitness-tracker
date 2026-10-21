-- First sign-in setup: what you told James, so his advice fits you.
alter table public.users
  add column if not exists training_style     text check (training_style is null or length(training_style) <= 30),  -- "strength", "bodybuilding", "calisthenics"…
  add column if not exists training_frequency text check (training_frequency is null or length(training_frequency) <= 20), -- "casual", "regular", "gym-rat", "daily"
  add column if not exists experience         text check (experience is null or length(experience) <= 20),           -- "new", "some", "experienced"
  add column if not exists height_cm          numeric check (height_cm is null or height_cm between 90 and 250),
  add column if not exists onboarded_at       timestamptz;

grant update (training_style, training_frequency, experience, height_cm, onboarded_at) on public.users to authenticated;
