import type { E1rmFormula } from "@/config/app.config";

/**
 * Estimated one-rep max. Default is Epley: w × (1 + r/30).
 * A single rep returns the weight itself for every formula.
 */
export function e1rm(weight: number, reps: number, formula: E1rmFormula = "epley"): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  switch (formula) {
    case "epley":
      return weight * (1 + reps / 30);
    case "brzycki":
      return reps >= 37 ? weight : (weight * 36) / (37 - reps);
    case "lombardi":
      return weight * Math.pow(reps, 0.1);
    case "oconner":
      return weight * (1 + reps / 40);
  }
}
