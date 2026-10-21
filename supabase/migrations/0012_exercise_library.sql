-- Exercise library: fixes duplicates and adds ~114 exercises with synonyms.
-- Generated from src/lib/domain/library.ts by `npm run gen:library`. Safe to run more than once.

-- 1. Synonyms ("RDL", "stiff leg deadlift" → Romanian Deadlift), used when matching what people type.
alter table public.exercises add column if not exists aliases text[] not null default '{}';

-- 2. Merge duplicate library exercises (seed.sql run twice made two of each).
--    Everything pointing at a duplicate is moved to the one that's kept, then the duplicate is deleted.
drop table if exists _dupes;
create temp table _dupes as
  select e.id as dup_id, k.keep_id
  from public.exercises e
  join (
    select lower(name) as n, (array_agg(id order by id))[1] as keep_id
    from public.exercises where owner_id is null
    group by lower(name) having count(*) > 1
  ) k on lower(e.name) = k.n
  where e.owner_id is null and e.id <> k.keep_id;

update public.split_day_exercises t set exercise_id = d.keep_id from _dupes d where t.exercise_id = d.dup_id;
update public.sets t set exercise_id = d.keep_id from _dupes d where t.exercise_id = d.dup_id;
update public.personal_records t set exercise_id = d.keep_id from _dupes d where t.exercise_id = d.dup_id;
update public.goals t set exercise_id = d.keep_id from _dupes d where t.exercise_id = d.dup_id;
delete from public.exercises where id in (select dup_id from _dupes);
drop table _dupes;

-- 3. Never again: one library exercise per name.
create unique index if not exists exercises_library_name on public.exercises (lower(name)) where owner_id is null;

-- 4. The library (existing names get their synonyms; new ones are added).
insert into public.exercises (name, category, equipment, aliases) values
  ('Bench Press', 'upper', 'barbell', array['bench', 'flat bench', 'bb bench', 'barbell bench', 'bp', 'flat barbell bench', 'bench press (barbell)']::text[]),
  ('Incline Bench Press', 'upper', 'barbell', array['incline bench', 'incline barbell', 'incline bb bench', 'incline press']::text[]),
  ('Decline Bench Press', 'upper', 'barbell', array['decline bench', 'decline', 'decline press']::text[]),
  ('Close-Grip Bench Press', 'upper', 'barbell', array['close grip bench', 'cgbp', 'narrow grip bench']::text[]),
  ('Dumbbell Bench Press', 'upper', 'dumbbell', array['db bench', 'dumbbell bench', 'flat db press', 'db press']::text[]),
  ('Incline Dumbbell Press', 'upper', 'dumbbell', array['incline db press', 'incline db bench', 'incline dumbbell bench']::text[]),
  ('Chest Fly Machine', 'upper', 'machine', array['pec deck', 'pec fly', 'fly machine', 'machine fly', 'chest fly', 'fly machine single']::text[]),
  ('Dumbbell Fly', 'upper', 'dumbbell', array['db fly', 'db flye', 'flyes', 'dumbbell flye']::text[]),
  ('Cable Crossover', 'upper', 'cable', array['cable fly', 'crossover', 'cable flye']::text[]),
  ('Machine Chest Press', 'upper', 'machine', array['chest press', 'hammer strength press', 'seated chest press']::text[]),
  ('Push-up', 'upper', 'bodyweight', array['pushup', 'push up', 'press up']::text[]),
  ('Dip', 'upper', 'bodyweight', array['dips', 'chest dip', 'parallel bar dip']::text[]),
  ('Deadlift', 'lower', 'barbell', array['dl', 'conventional deadlift', 'deadlifts']::text[]),
  ('Sumo Deadlift', 'lower', 'barbell', array['sumo', 'sumo dl']::text[]),
  ('Romanian Deadlift', 'lower', 'barbell', array['rdl', 'rdls', 'romanian dl', 'stiff leg deadlift', 'sldl']::text[]),
  ('Rack Pull', 'lower', 'barbell', array['rack pulls', 'block pull']::text[]),
  ('Barbell Row', 'upper', 'barbell', array['bent over row', 'bb row', 'bent-over row', 'pendlay row', 'bor']::text[]),
  ('Dumbbell Row', 'upper', 'dumbbell', array['db row', 'one arm row', 'single arm row', 'bench db row', 'kroc row']::text[]),
  ('Seated Cable Row', 'upper', 'cable', array['cable row', 'seated row', 'low row', 'seated row single']::text[]),
  ('T-Bar Row', 'upper', 'machine', array['tbar row', 't bar row', 'landmine row']::text[]),
  ('Chest-Supported Row', 'upper', 'machine', array['chest supported row', 'seal row', 'machine row']::text[]),
  ('Lat Pulldown', 'upper', 'cable', array['pulldown', 'lat pull down', 'lat pull', 'pull down']::text[]),
  ('Straight-Arm Pulldown', 'upper', 'cable', array['straight arm pulldown', 'lat prayer', 'pullover cable']::text[]),
  ('Pull-up', 'upper', 'bodyweight', array['pullup', 'pull up', 'pullups', 'pull-ups']::text[]),
  ('Chin-up', 'upper', 'bodyweight', array['chinup', 'chin up', 'chins']::text[]),
  ('Assisted Pull-up', 'upper', 'machine', array['assisted pullup', 'assisted chin up', 'gravitron']::text[]),
  ('Inverted Row', 'upper', 'bodyweight', array['australian pull up', 'body row']::text[]),
  ('Face Pull', 'upper', 'cable', array['face pulls', 'rope face pull']::text[]),
  ('Back Extension', 'lower', 'bodyweight', array['hyperextension', 'hyper', 'back raise', '45 degree back extension']::text[]),
  ('Good Morning', 'lower', 'barbell', array['good mornings']::text[]),
  ('Overhead Press', 'upper', 'barbell', array['ohp', 'military press', 'standing press', 'bar shoulder press', 'barbell shoulder press']::text[]),
  ('Seated Dumbbell Shoulder Press', 'upper', 'dumbbell', array['db shoulder press', 'dumbbell shoulder press', 'seated db press', 'db ohp']::text[]),
  ('Machine Shoulder Press', 'upper', 'machine', array['shoulder press machine', 'machine ohp']::text[]),
  ('Arnold Press', 'upper', 'dumbbell', array['arnolds']::text[]),
  ('Push Press', 'upper', 'barbell', array['pp']::text[]),
  ('Lateral Raise', 'upper', 'dumbbell', array['lat raise', 'side raise', 'side lateral', 'db lateral raise', 'lateral raises']::text[]),
  ('Cable Lateral Raise', 'upper', 'cable', array['cable lat raise', 'cable side raise']::text[]),
  ('Machine Lateral Raise', 'upper', 'machine', array['machine lat raise', 'machine lat. raise', 'lateral raise machine']::text[]),
  ('Lean-Away Lateral Raise', 'upper', 'dumbbell', array['lean-away db lat raise', 'lean away lateral raise', 'lean away lat raise']::text[]),
  ('Front Raise', 'upper', 'dumbbell', array['front raises', 'db front raise']::text[]),
  ('Rear Delt Fly', 'upper', 'dumbbell', array['rear delt raise', 'reverse fly', 'bent over fly', 'rear fly']::text[]),
  ('Reverse Pec Deck', 'upper', 'machine', array['rear pec deck', 'r pec deck', 'reverse fly machine', 'rear delt machine']::text[]),
  ('Upright Row', 'upper', 'barbell', array['upright rows']::text[]),
  ('Barbell Shrug', 'upper', 'barbell', array['shrug', 'shrugs', 'bb shrug']::text[]),
  ('Dumbbell Shrug', 'upper', 'dumbbell', array['db shrug', 'db shrugs']::text[]),
  ('Cable Shrug', 'upper', 'cable', array['cable shrugs']::text[]),
  ('Dead Hang', 'upper', 'bodyweight', array['dead-hang', 'bar hang', 'passive hang']::text[]),
  ('Barbell Curl', 'upper', 'barbell', array['bb curl', 'curl', 'curls', 'barbell curls', 'bicep curl', 'biceps curl']::text[]),
  ('EZ-Bar Curl', 'upper', 'barbell', array['ez curl', 'ez bar curl']::text[]),
  ('Dumbbell Curl', 'upper', 'dumbbell', array['db curl', 'dumbbell curls', 'alternating curl']::text[]),
  ('Hammer Curl', 'upper', 'dumbbell', array['hammer curls', 'hammers', 'neutral grip curl']::text[]),
  ('Preacher Curl', 'upper', 'machine', array['preacher', 'preacher curls', 'scott curl']::text[]),
  ('Incline Dumbbell Curl', 'upper', 'dumbbell', array['incline curl', 'incline db curl']::text[]),
  ('Cable Curl', 'upper', 'cable', array['cable curls', 'rope curl']::text[]),
  ('Concentration Curl', 'upper', 'dumbbell', array['concentration curls']::text[]),
  ('Triceps Pushdown', 'upper', 'cable', array['pushdown', 'push down', 'tricep pushdown', 'cable pushdown', 'rope pushdown', 'rope pull down']::text[]),
  ('Overhead Triceps Extension', 'upper', 'cable', array['overhead extension', 'oh tricep extension', 'french press', 'overhead tricep']::text[]),
  ('Skull Crusher', 'upper', 'barbell', array['skull crushers', 'lying triceps extension', 'ez skull crusher', 'skullcrusher']::text[]),
  ('Triceps Dip Machine', 'upper', 'machine', array['dip machine', 'seated dip']::text[]),
  ('Wrist Curl', 'upper', 'dumbbell', array['wrist curls', 'forearm curl']::text[]),
  ('Back Squat', 'lower', 'barbell', array['squat', 'squats', 'bb squat', 'high bar squat', 'low bar squat', 'back squats']::text[]),
  ('Front Squat', 'lower', 'barbell', array['front squats', 'fs']::text[]),
  ('Goblet Squat', 'lower', 'dumbbell', array['goblet', 'goblet squats']::text[]),
  ('Hack Squat', 'lower', 'machine', array['hack', 'hack squats']::text[]),
  ('Smith Machine Squat', 'lower', 'smith', array['smith squat']::text[]),
  ('Bulgarian Split Squat', 'lower', 'dumbbell', array['bss', 'split squat', 'rear foot elevated split squat', 'rfess', 'bulgarians']::text[]),
  ('Leg Press', 'lower', 'machine', array['legpress', '45 leg press', 'sled press']::text[]),
  ('Leg Extension', 'lower', 'machine', array['leg extensions', 'quad extension', 'knee extension']::text[]),
  ('Lying Leg Curl', 'lower', 'machine', array['leg curl', 'hamstring curl', 'lying hamstring curl', 'leg curls']::text[]),
  ('Seated Leg Curl', 'lower', 'machine', array['seated hamstring curl']::text[]),
  ('Walking Lunge', 'lower', 'dumbbell', array['lunges', 'lunge', 'walking lunges', 'db lunge']::text[]),
  ('Reverse Lunge', 'lower', 'dumbbell', array['reverse lunges', 'step back lunge']::text[]),
  ('Step-up', 'lower', 'dumbbell', array['step up', 'step ups', 'box step up']::text[]),
  ('Hip Thrust', 'lower', 'barbell', array['hip thrusts', 'barbell hip thrust', 'glute bridge thrust']::text[]),
  ('Glute Bridge', 'lower', 'bodyweight', array['glute bridges']::text[]),
  ('Hip Abduction', 'lower', 'machine', array['abduction', 'abductor', 'abductors', 'hip abductor', 'outer thigh']::text[]),
  ('Hip Adduction', 'lower', 'machine', array['adduction', 'adductor', 'adductors', 'hip adductor', 'inner thigh']::text[]),
  ('Calf Raise', 'lower', 'machine', array['standing calf raise', 'calf raises', 'calves', 'calf machine', 'standing calves']::text[]),
  ('Seated Calf Raise', 'lower', 'machine', array['seated calves', 'seated calf']::text[]),
  ('Cable Kickback', 'lower', 'cable', array['glute kickback', 'kickbacks']::text[]),
  ('Nordic Curl', 'lower', 'bodyweight', array['nordic', 'nordics', 'nordic hamstring curl']::text[]),
  ('Kettlebell Swing', 'lower', 'kettlebell', array['kb swing', 'swings', 'kettlebell swings']::text[]),
  ('Plank', 'core', 'bodyweight', array['planks', 'front plank']::text[]),
  ('Side Plank', 'core', 'bodyweight', array['side planks']::text[]),
  ('Hanging Leg Raise', 'core', 'bodyweight', array['leg raise', 'hanging leg raises', 'hlr', 'toes to bar']::text[]),
  ('Cable Crunch', 'core', 'cable', array['kneeling cable crunch', 'rope crunch']::text[]),
  ('Crunch', 'core', 'bodyweight', array['crunches', 'sit up', 'sit-up', 'situps']::text[]),
  ('Ab Wheel Rollout', 'core', 'other', array['ab wheel', 'rollout', 'ab roller']::text[]),
  ('Russian Twist', 'core', 'bodyweight', array['russian twists']::text[]),
  ('Pallof Press', 'core', 'cable', array['pallof']::text[]),
  ('Dead Bug', 'core', 'bodyweight', array['deadbug', 'dead bugs']::text[]),
  ('Hollow Hold', 'core', 'bodyweight', array['hollow body', 'hollow body hold']::text[]),
  ('Muscle-up', 'upper', 'bodyweight', array['muscle up', 'muscleup']::text[]),
  ('Pike Push-up', 'upper', 'bodyweight', array['pike pushup', 'pike push up']::text[]),
  ('Handstand Push-up', 'upper', 'bodyweight', array['hspu', 'handstand pushup']::text[]),
  ('Pistol Squat', 'lower', 'bodyweight', array['pistol', 'pistols', 'single leg squat']::text[]),
  ('L-Sit', 'core', 'bodyweight', array['l sit', 'lsit']::text[]),
  ('Burpee', 'other', 'bodyweight', array['burpees']::text[]),
  ('Power Clean', 'lower', 'barbell', array['clean', 'cleans', 'power cleans']::text[]),
  ('Clean and Jerk', 'lower', 'barbell', array['c&j', 'clean & jerk']::text[]),
  ('Snatch', 'lower', 'barbell', array['power snatch']::text[]),
  ('Farmer''s Carry', 'other', 'dumbbell', array['farmers walk', 'farmer walk', 'farmers carry', 'loaded carry']::text[]),
  ('Sled Push', 'lower', 'other', array['prowler', 'sled']::text[]),
  ('Thruster', 'other', 'barbell', array['thrusters']::text[]),
  ('Turkish Get-up', 'other', 'kettlebell', array['tgu', 'turkish getup']::text[]),
  ('Running', 'cardio', 'other', array['run', 'jog', 'jogging']::text[]),
  ('Treadmill', 'cardio', 'machine', array['treadmill run', 'treadmill walk']::text[]),
  ('Walking', 'cardio', 'other', array['walk', 'incline walk']::text[]),
  ('Cycling', 'cardio', 'other', array['bike', 'cycle', 'biking', 'stationary bike', 'spin']::text[]),
  ('Rowing Machine', 'cardio', 'machine', array['rower', 'erg', 'row erg', 'concept2']::text[]),
  ('Elliptical', 'cardio', 'machine', array['cross trainer']::text[]),
  ('Stair Climber', 'cardio', 'machine', array['stairmaster', 'stairs', 'stair stepper']::text[]),
  ('Swimming', 'cardio', 'other', array['swim', 'laps']::text[]),
  ('Jump Rope', 'cardio', 'other', array['skipping', 'jumprope', 'double unders']::text[])
on conflict ((lower(name))) where owner_id is null do update set aliases = excluded.aliases;
