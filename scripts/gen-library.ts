/**
 * Writes the exercise-library migration from src/lib/domain/library.ts.
 * Run: npm run gen:library
 * When the library changes after a migration has shipped, bump FILE to a new
 * number so nobody has to wonder which version of an old file they ran. Each
 * file holds the whole library and is safe to run more than once.
 */
import { writeFileSync } from "node:fs";
import { LIBRARY } from "../src/lib/domain/library";

const FILE = "supabase/migrations/0014_exercise_library_more.sql";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (xs: string[]) => `array[${xs.map(q).join(", ")}]::text[]`;

const sql = `-- Exercise library (${LIBRARY.length} exercises with synonyms); also merges any duplicates.
-- Generated from src/lib/domain/library.ts by \`npm run gen:library\`. Safe to run more than once.

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
${LIBRARY.map((e) => `  (${q(e.name)}, ${q(e.category)}, ${q(e.equipment)}, ${arr(e.aliases)})`).join(",\n")}
on conflict ((lower(name))) where owner_id is null do update set aliases = excluded.aliases;
`;
writeFileSync(FILE, sql);
console.log(`wrote ${LIBRARY.length} exercises`);
