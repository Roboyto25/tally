import type { ActivityLevel, Sex, Targets } from './types';
import { energyFromMacros } from './nutrition';

export const ACTIVITY: Record<ActivityLevel, { label: string; detail: string; multiplier: number }> = {
  sedentary: { label: 'Sedentary', detail: 'Desk job, little planned exercise', multiplier: 1.2 },
  light: { label: 'Lightly active', detail: 'Light exercise 1–3 days a week', multiplier: 1.375 },
  moderate: { label: 'Moderately active', detail: 'Moderate exercise 3–5 days a week', multiplier: 1.55 },
  active: { label: 'Very active', detail: 'Hard exercise 6–7 days a week', multiplier: 1.725 },
  very_active: { label: 'Extremely active', detail: 'Physical job plus hard training', multiplier: 1.9 },
};

export const WEEKLY_RATES = [0, 0.25, 0.5, 0.75, 1, 1.5];
/** ~3,500 kcal per lb of body weight change; a planning approximation, not a law. */
export const KCAL_PER_LB = 3500;
export const CALORIE_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };

export interface TargetInput {
  sex: Sex;
  age: number;
  heightIn: number;
  weightLb: number;
  targetWeightLb: number;
  weeklyRate: number;
  activity: ActivityLevel;
  preferredCalories?: number;
  preferredProtein?: number;
}

export interface TargetResult {
  targets: Targets;
  bmr: number;
  tdee: number;
  dailyDeficit: number;
  warnings: string[];
}

/** Mifflin–St Jeor resting energy expenditure, kcal/day. */
export function bmrMifflin(sex: Sex, weightLb: number, heightIn: number, age: number): number {
  const kg = weightLb * 0.45359237;
  const cm = heightIn * 2.54;
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function tdee(sex: Sex, weightLb: number, heightIn: number, age: number, activity: ActivityLevel): number {
  return bmrMifflin(sex, weightLb, heightIn, age) * ACTIVITY[activity].multiplier;
}

const round10 = (v: number) => Math.round(v / 10) * 10;

/**
 * Builds macro targets for a calorie level.
 * Protein: preferred, else 0.8 g per lb of goal weight, capped at 40% of calories.
 * Fat: 28% of calories. Carbs: the remainder (total carbs, fiber included).
 * Fiber: 14 g per 1,000 kcal (Dietary Guidelines reference).
 */
export function macrosFor(calories: number, goalWeightLb: number, preferredProtein?: number): Targets {
  let protein = preferredProtein && preferredProtein > 0 ? preferredProtein : 0.8 * goalWeightLb;
  protein = Math.min(protein, (calories * 0.4) / 4);
  protein = Math.round(protein);
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  const fiber = Math.round((calories / 1000) * 14);
  return { calories, protein, carbs, fat, fiber, ...extDefaults(calories) };
}

/**
 * Default limits for the cholesterol-related nutrients.
 * - Saturated fat: under 10% of calories (Dietary Guidelines for Americans; AHA suggests
 *   about 6% for people lowering LDL, so a clinician may set it lower).
 * - Soluble fiber: 7 g/day, inside the 5–10 g/day range commonly cited for LDL lowering.
 * - Sodium: 2,300 mg/day (Dietary Guidelines upper limit).
 * Dietary cholesterol has no default limit: it is tracked and shown, but it is not the
 * main driver of blood LDL for most people.
 */
export function extDefaults(calories: number): { satFat: number; solubleFiber: number; sodium: number } {
  return { satFat: Math.round((calories * 0.1) / 9), solubleFiber: 7, sodium: 2300 };
}

export type FullTargets = Targets & { satFat: number; solubleFiber: number; sodium: number };

/** Fills defaults for profiles saved before the extended targets existed. */
export function resolveTargets(t: Targets): FullTargets {
  const d = extDefaults(t.calories);
  return { ...t, satFat: t.satFat ?? d.satFat, solubleFiber: t.solubleFiber ?? d.solubleFiber, sodium: t.sodium ?? d.sodium };
}

export function computeTargets(input: TargetInput): TargetResult {
  const warnings: string[] = [];
  const bmr = bmrMifflin(input.sex, input.weightLb, input.heightIn, input.age);
  const maintenance = bmr * ACTIVITY[input.activity].multiplier;
  const losing = input.targetWeightLb < input.weightLb;
  const rate = losing ? Math.max(0, input.weeklyRate) : 0;
  if (!losing && input.weeklyRate > 0) warnings.push('Target weight is not below current weight, so the target is set to maintenance.');
  const dailyDeficit = (rate * KCAL_PER_LB) / 7;

  let calories = input.preferredCalories && input.preferredCalories > 0 ? input.preferredCalories : round10(maintenance - dailyDeficit);
  const floor = CALORIE_FLOOR[input.sex];
  if (calories < floor) warnings.push(`${Math.round(calories).toLocaleString()} kcal is below ${floor.toLocaleString()} kcal, a common minimum for unsupervised dieting. Review this with a clinician or choose a slower rate.`);
  if (rate > input.weightLb * 0.01) warnings.push(`${rate} lb/week is more than 1% of body weight per week. A slower rate is easier to sustain and preserves more muscle.`);
  if (maintenance - calories > maintenance * 0.25) warnings.push('This is more than a 25% deficit from estimated maintenance.');

  const targets = macrosFor(calories, Math.min(input.targetWeightLb, input.weightLb), input.preferredProtein);
  if (input.preferredProtein && input.preferredProtein > targets.protein) {
    warnings.push(`Protein capped at ${targets.protein} g (40% of calories) to leave room for carbs and fat.`);
  }
  if (targets.carbs < 50) warnings.push('Carbohydrate target is under 50 g/day; check that protein and fat are not crowding it out.');
  return { targets, bmr, tdee: maintenance, dailyDeficit, warnings };
}

/** Returns a message when manually edited macros don't add up to the calorie target. */
export function consistencyWarning(t: Targets): string | null {
  if (t.fiber > t.carbs) return 'Fiber is part of total carbohydrate, so the fiber target can’t exceed the carb target.';
  if (t.satFat !== undefined && t.satFat > t.fat) return 'Saturated fat is part of total fat, so its limit can’t exceed the fat target.';
  if (t.solubleFiber !== undefined && t.solubleFiber > t.fiber) return 'Soluble fiber is part of total fiber, so its target can’t exceed the fiber target.';
  const fromMacros = energyFromMacros(t);
  if (t.calories <= 0) return 'Calorie target must be above zero.';
  const gap = fromMacros - t.calories;
  if (Math.abs(gap) > t.calories * 0.05) {
    return `Protein, carbs, and fat add up to ${Math.round(fromMacros).toLocaleString()} kcal, which is ${Math.abs(Math.round(gap)).toLocaleString()} kcal ${gap > 0 ? 'above' : 'below'} the calorie target.`;
  }
  return null;
}
