-- Shared exercise library (owner_id null = visible to everyone).
insert into public.exercises (name, category, equipment) values
  ('Bench Press', 'upper', 'barbell'),
  ('Overhead Press', 'upper', 'barbell'),
  ('Incline Dumbbell Press', 'upper', 'dumbbell'),
  ('Dip', 'upper', 'bodyweight'),
  ('Barbell Row', 'upper', 'barbell'),
  ('Pull-up', 'upper', 'bodyweight'),
  ('Lat Pulldown', 'upper', 'cable'),
  ('Barbell Curl', 'upper', 'barbell'),
  ('Back Squat', 'lower', 'barbell'),
  ('Deadlift', 'lower', 'barbell'),
  ('Romanian Deadlift', 'lower', 'barbell'),
  ('Leg Press', 'lower', 'machine'),
  ('Calf Raise', 'lower', 'machine'),
  ('Plank', 'core', 'bodyweight');
