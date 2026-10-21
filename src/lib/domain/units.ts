import type { Unit } from "@/config/app.config";

export const KG_PER_LB = 0.45359237;

export function toKg(value: number, unit: Unit): number {
  return unit === "kg" ? value : value * KG_PER_LB;
}

export function fromKg(kg: number, unit: Unit): number {
  return unit === "kg" ? kg : kg / KG_PER_LB;
}

/** Round to the nearest multiple of `step` (avoids 184.99999 after lb↔kg trips). */
export function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function formatWeight(kg: number, unit: Unit, decimals = 1): string {
  const v = fromKg(kg, unit);
  const rounded = Number(v.toFixed(decimals));
  return `${rounded} ${unit}`;
}
