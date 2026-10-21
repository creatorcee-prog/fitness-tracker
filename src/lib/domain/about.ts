/**
 * What you told James in the first sign-in setup. Used to suggest a starter
 * split and weekly target, and given to James so his advice fits you.
 */
export type TrainingStyle = "strength" | "bodybuilding" | "calisthenics" | "weight-loss" | "general" | "runner" | "swimmer" | "cyclist" | "athlete";
export type Frequency = "casual" | "regular" | "gym-rat" | "daily";
export type Experience = "new" | "some" | "experienced";

export interface About {
  style: TrainingStyle | null;
  frequency: Frequency | null;
  experience: Experience | null;
  heightCm: number | null;
}

export const STYLES: { id: TrainingStyle; label: string; emoji: string; blurb: string }[] = [
  { id: "strength", label: "Strength Builder", emoji: "🏋️", blurb: "Get stronger at the big lifts" },
  { id: "bodybuilding", label: "Bodybuilder", emoji: "💪", blurb: "Build muscle and shape" },
  { id: "calisthenics", label: "Calisthenics", emoji: "🤸", blurb: "Master your bodyweight" },
  { id: "weight-loss", label: "Weight Loss", emoji: "🔥", blurb: "Lose fat, keep muscle" },
  { id: "general", label: "General Fitness", emoji: "⚡", blurb: "Feel good, stay healthy" },
  { id: "runner", label: "Runner", emoji: "🏃", blurb: "Lift to run better" },
  { id: "swimmer", label: "Swimmer", emoji: "🏊", blurb: "Lift to swim better" },
  { id: "cyclist", label: "Cyclist", emoji: "🚴", blurb: "Lift to ride better" },
  { id: "athlete", label: "Athlete", emoji: "🏆", blurb: "Train for a sport" },
];

export const FREQUENCIES: { id: Frequency; label: string; blurb: string; perWeek: number }[] = [
  { id: "casual", label: "Casual", blurb: "1–2 days a week", perWeek: 2 },
  { id: "regular", label: "Regular", blurb: "3–4 days a week", perWeek: 3 },
  { id: "gym-rat", label: "Gym Rat", blurb: "5–6 days a week", perWeek: 5 },
  { id: "daily", label: "Every Day", blurb: "Can't stay away", perWeek: 6 },
];

export const EXPERIENCE: { id: Experience; label: string; blurb: string }[] = [
  { id: "new", label: "Just starting", blurb: "Under 6 months" },
  { id: "some", label: "Getting there", blurb: "6 months to 2 years" },
  { id: "experienced", label: "Seasoned", blurb: "2+ years" },
];

/**
 * BMI from height and weight, with its well-known limit spelled out: it can't
 * tell muscle from fat, so it overestimates "overweight" in people who lift.
 */
export function bmi(heightCm: number | null | undefined, weightKg: number | null | undefined): { value: number; band: string } | null {
  if (!heightCm || !weightKg || heightCm < 90 || weightKg < 25) return null;
  const v = weightKg / (heightCm / 100) ** 2;
  const band = v < 18.5 ? "underweight" : v < 25 ? "healthy range" : v < 30 ? "overweight range" : "obese range";
  return { value: Math.round(v * 10) / 10, band };
}
export const BMI_NOTE = "BMI can't tell muscle from fat, so it reads high for people who lift. Use it as a rough guide, not a verdict.";

export const describeAbout = (a: Partial<About>): string[] => [
  a.style ? `Goal: ${STYLES.find((s) => s.id === a.style)?.label ?? a.style}` : null,
  a.frequency ? `Trains: ${FREQUENCIES.find((f) => f.id === a.frequency)?.blurb ?? a.frequency}` : null,
  a.experience ? `Experience: ${EXPERIENCE.find((e) => e.id === a.experience)?.blurb ?? a.experience}` : null,
].filter((x): x is string => !!x);
