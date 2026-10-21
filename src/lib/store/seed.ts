import { LIBRARY } from "@/lib/domain/library";
import type { Exercise, Split } from "@/lib/domain/types";

export const SEED_EXERCISES: Omit<Exercise, "ownerId">[] = [
  { id: "ex-bench", name: "Bench Press", category: "upper", equipment: "barbell", incrementKg: null },
  { id: "ex-ohp", name: "Overhead Press", category: "upper", equipment: "barbell", incrementKg: null },
  { id: "ex-incline-db", name: "Incline Dumbbell Press", category: "upper", equipment: "dumbbell", incrementKg: null },
  { id: "ex-dip", name: "Dip", category: "upper", equipment: "bodyweight", incrementKg: null },
  { id: "ex-row", name: "Barbell Row", category: "upper", equipment: "barbell", incrementKg: null },
  { id: "ex-pullup", name: "Pull-up", category: "upper", equipment: "bodyweight", incrementKg: null },
  { id: "ex-lat", name: "Lat Pulldown", category: "upper", equipment: "cable", incrementKg: null },
  { id: "ex-curl", name: "Barbell Curl", category: "upper", equipment: "barbell", incrementKg: null },
  { id: "ex-squat", name: "Back Squat", category: "lower", equipment: "barbell", incrementKg: null },
  { id: "ex-deadlift", name: "Deadlift", category: "lower", equipment: "barbell", incrementKg: null },
  { id: "ex-rdl", name: "Romanian Deadlift", category: "lower", equipment: "barbell", incrementKg: null },
  { id: "ex-legpress", name: "Leg Press", category: "lower", equipment: "machine", incrementKg: null },
  { id: "ex-calf", name: "Calf Raise", category: "lower", equipment: "machine", incrementKg: null },
  { id: "ex-plank", name: "Plank", category: "core", equipment: "bodyweight", incrementKg: null },
];

export function seedSplit(id = "split-ppl"): Split {
  const day = (position: number, name: string, ex: [string, number, string][]) => ({
    id: `${id}-d${position}`,
    splitId: id,
    position,
    name,
    weekday: [1, 3, 5][position] ?? null,
    exercises: ex.map(([exerciseId, targetSets, repRange], order) => ({ exerciseId, order, targetSets, repRange })),
  });
  return {
    id,
    name: "Push / Pull / Legs",
    mode: "rotation",
    isActive: true,
    days: [
      day(0, "Push", [["ex-bench", 3, "5-8"], ["ex-ohp", 3, "6-10"], ["ex-incline-db", 3, "8-12"]]),
      day(1, "Pull", [["ex-row", 3, "6-10"], ["ex-pullup", 3, "5-10"], ["ex-curl", 2, "8-12"]]),
      day(2, "Legs", [["ex-squat", 3, "5-8"], ["ex-rdl", 3, "6-10"], ["ex-calf", 3, "10-15"]]),
    ],
  };
}

/** The starter split rebuilt with fresh ids, mapped onto a store's exercise ids by name. */
export function starterSplitFor(exercises: Exercise[], newId: () => string): Split {
  const byName = new Map(exercises.map((e) => [e.name.toLowerCase(), e.id]));
  const seedNames = new Map(SEED_EXERCISES.map((e) => [e.id, e.name.toLowerCase()]));
  const tpl = seedSplit();
  const id = newId();
  return {
    ...tpl,
    id,
    days: tpl.days.map((d) => ({
      ...d,
      id: newId(),
      splitId: id,
      exercises: d.exercises
        .map((x) => ({ ...x, exerciseId: byName.get(seedNames.get(x.exerciseId) ?? "") ?? "" }))
        .filter((x) => x.exerciseId),
    })),
  };
}

/**
 * The whole library for the local backend: the seed exercises keep their ids
 * (the starter split uses them), everything else gets a stable "lib-" id.
 */
export function libraryExercises(): Omit<Exercise, "ownerId">[] {
  const seeded = new Map(SEED_EXERCISES.map((e) => [e.name.toLowerCase(), e]));
  return LIBRARY.map((l) => {
    const s = seeded.get(l.name.toLowerCase());
    return { id: s?.id ?? `lib-${l.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: l.name, category: l.category, equipment: l.equipment, incrementKg: null, aliases: l.aliases };
  });
}
