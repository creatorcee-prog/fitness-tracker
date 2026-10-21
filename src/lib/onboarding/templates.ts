import type { Frequency, TrainingStyle } from "@/lib/domain/about";
import { matchExercise } from "@/lib/domain/match";
import type { Exercise, Split } from "@/lib/domain/types";

/**
 * Starter plans James suggests from the setup answers. Deliberately simple
 * and well-established structures (full body, upper/lower, push/pull/legs):
 * a sensible place to start, edited freely on the Split page.
 */
type Day = { name: string; lifts: [string, number, string][] };
export interface Template {
  name: string;
  why: string;
  days: Day[];
}

const FULL_A = (r: string): Day => ({ name: "Full Body A", lifts: [["Back Squat", 3, r], ["Bench Press", 3, r], ["Barbell Row", 3, r], ["Plank", 3, "30-45"]] });
const FULL_B = (r: string): Day => ({ name: "Full Body B", lifts: [["Deadlift", 2, "5"], ["Overhead Press", 3, r], ["Lat Pulldown", 3, "8-12"], ["Walking Lunge", 2, "10-12"]] });

export function starterTemplate(style: TrainingStyle | null, frequency: Frequency | null): Template {
  const often = frequency === "gym-rat" || frequency === "daily";
  const casual = frequency === "casual" || !frequency;
  switch (style) {
    case "strength":
      if (casual) return { name: "Strength: Full Body", why: "Two full-body days hit every big lift twice a week.", days: [FULL_A("5"), FULL_B("5")] };
      if (often) return { name: "Strength: Push / Pull / Legs", why: "Six days of push, pull and legs: each big lift twice a week.", days: [
        { name: "Push", lifts: [["Bench Press", 4, "4-6"], ["Overhead Press", 3, "5-8"], ["Incline Dumbbell Press", 3, "8-10"], ["Triceps Pushdown", 3, "10-12"]] },
        { name: "Pull", lifts: [["Deadlift", 3, "3-5"], ["Barbell Row", 3, "5-8"], ["Pull-up", 3, "6-10"], ["Hammer Curl", 3, "10-12"]] },
        { name: "Legs", lifts: [["Back Squat", 4, "4-6"], ["Romanian Deadlift", 3, "6-8"], ["Leg Press", 3, "8-12"], ["Calf Raise", 3, "10-15"]] },
      ] };
      return { name: "Strength: Upper / Lower", why: "Upper and lower days, four a week (or rotate at three).", days: [
        { name: "Upper A", lifts: [["Bench Press", 4, "4-6"], ["Barbell Row", 4, "5-8"], ["Overhead Press", 3, "6-8"], ["Chin-up", 3, "6-10"]] },
        { name: "Lower A", lifts: [["Back Squat", 4, "4-6"], ["Romanian Deadlift", 3, "6-8"], ["Leg Extension", 2, "10-12"], ["Calf Raise", 3, "10-15"]] },
        { name: "Upper B", lifts: [["Overhead Press", 4, "4-6"], ["Lat Pulldown", 3, "8-10"], ["Incline Dumbbell Press", 3, "8-10"], ["Dumbbell Row", 3, "8-10"]] },
        { name: "Lower B", lifts: [["Deadlift", 3, "3-5"], ["Front Squat", 3, "5-8"], ["Lying Leg Curl", 3, "8-12"], ["Hanging Leg Raise", 3, "8-12"]] },
      ] };
    case "bodybuilding":
      if (casual) return { name: "Muscle: Full Body", why: "Two full-body days in the 8–12 rep range.", days: [FULL_A("8-12"), FULL_B("8-12")] };
      if (often) return { name: "Muscle: Push / Pull / Legs", why: "Push, pull and legs, each twice a week, plenty of volume.", days: [
        { name: "Push", lifts: [["Bench Press", 3, "6-10"], ["Incline Dumbbell Press", 3, "8-12"], ["Lateral Raise", 4, "12-15"], ["Chest Fly Machine", 3, "12-15"], ["Triceps Pushdown", 3, "10-15"]] },
        { name: "Pull", lifts: [["Lat Pulldown", 3, "8-12"], ["Seated Cable Row", 3, "8-12"], ["Reverse Pec Deck", 3, "12-15"], ["Barbell Curl", 3, "8-12"], ["Hammer Curl", 3, "10-12"]] },
        { name: "Legs", lifts: [["Back Squat", 3, "6-10"], ["Romanian Deadlift", 3, "8-10"], ["Leg Press", 3, "10-15"], ["Lying Leg Curl", 3, "10-15"], ["Calf Raise", 4, "10-15"]] },
      ] };
      return { name: "Muscle: Upper / Lower", why: "Upper and lower days in the 8–12 range, 3–4 a week.", days: [
        { name: "Upper", lifts: [["Bench Press", 3, "6-10"], ["Seated Cable Row", 3, "8-12"], ["Seated Dumbbell Shoulder Press", 3, "8-12"], ["Lat Pulldown", 3, "8-12"], ["Lateral Raise", 3, "12-15"]] },
        { name: "Lower", lifts: [["Back Squat", 3, "6-10"], ["Romanian Deadlift", 3, "8-10"], ["Leg Press", 3, "10-15"], ["Lying Leg Curl", 3, "10-15"], ["Calf Raise", 3, "10-15"]] },
      ] };
    case "calisthenics":
      return { name: "Calisthenics: Push / Pull / Legs", why: "Bodyweight skills across three days; add reps, then harder variations.", days: [
        { name: "Push", lifts: [["Push-up", 3, "8-15"], ["Dip", 3, "6-12"], ["Pike Push-up", 3, "6-10"], ["Hollow Hold", 3, "20-40"]] },
        { name: "Pull", lifts: [["Pull-up", 3, "5-10"], ["Inverted Row", 3, "8-12"], ["Chin-up", 2, "5-10"], ["Hanging Leg Raise", 3, "8-12"]] },
        { name: "Legs", lifts: [["Bulgarian Split Squat", 3, "8-12"], ["Pistol Squat", 3, "3-8"], ["Glute Bridge", 3, "12-20"], ["Calf Raise", 3, "15-20"]] },
      ] };
    case "weight-loss":
    case "general":
      return { name: often ? "Fit: Full Body + Cardio" : "Fit: Full Body", why: "Full-body strength keeps muscle while you work on everything else.", days: [
        FULL_A("8-12"), FULL_B("8-12"),
        ...(casual ? [] : [{ name: "Cardio + Core", lifts: [["Walking", 1, "30"], ["Rowing Machine", 1, "10"], ["Plank", 3, "30-45"], ["Dead Bug", 3, "10"]] as [string, number, string][] }]),
      ] };
    default: // runner, swimmer, cyclist, athlete: strength that supports the sport
      return { name: "Strength for your sport", why: "Two short strength days that support your sport without wrecking your legs for it.", days: [
        { name: "Strength A", lifts: [["Back Squat", 3, "5-8"], ["Romanian Deadlift", 3, "6-8"], ["Push-up", 3, "10-15"], ["Side Plank", 2, "30"]] },
        { name: "Strength B", lifts: [["Bulgarian Split Squat", 3, "6-10"], ["Hip Thrust", 3, "8-10"], ["Pull-up", 3, "5-10"], ["Calf Raise", 3, "12-15"]] },
      ] };
  }
}

/** The template as a split using the account's exercises (by name or synonym). Lifts it can't find are left out. */
export function templateToSplit(t: Template, exercises: Exercise[], newId: () => string): Split {
  const id = newId();
  return {
    id, name: t.name, mode: "rotation", isActive: true,
    days: t.days.map((d, position) => ({
      id: newId(), splitId: id, position, name: d.name, weekday: null,
      exercises: d.lifts.flatMap(([name, sets, reps], order) => {
        const ex = exercises.find((e) => e.name.toLowerCase() === name.toLowerCase()) ?? matchExercise(name, exercises);
        return ex ? [{ exerciseId: ex.id, order, targetSets: sets, repRange: reps }] : [];
      }),
    })),
  };
}
