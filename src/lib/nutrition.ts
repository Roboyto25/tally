import type { FoodDef, FoodEntry, LoggedItem, Nutrients, SourceType } from './types';
import { ZERO } from './types';
import { massToGrams, volumeToMl, ML_PER_CUP, ML_PER_TBSP, ML_PER_TSP, ML_PER_FLOZ, SIZE_UNITS } from './units';

export const KEYS: (keyof Nutrients)[] = ['calories', 'protein', 'carbs', 'fat', 'fiber'];

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  return {
    calories: n.calories * factor,
    protein: n.protein * factor,
    carbs: n.carbs * factor,
    fat: n.fat * factor,
    fiber: n.fiber * factor,
  };
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fiber: a.fiber + b.fiber,
  };
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce(addNutrients, { ...ZERO });
}

/** Units the food can be measured in, for unit pickers. */
export function unitsForFood(food: FoodDef): string[] {
  const units = new Set<string>([food.defaultUnit, ...Object.keys(food.portions)]);
  if (food.basisUnit === 'g' || food.portions.g) {
    units.add('g');
    units.add('oz');
  }
  const hasVolume = food.liquid || food.portions.cup || food.portions.tbsp || food.portions.tsp || food.portions['fl oz'];
  if (hasVolume) {
    ['cup', 'tbsp', 'tsp', 'fl oz'].forEach((u) => units.add(u));
    if (food.liquid) units.add('ml');
  }
  units.delete('each');
  if (food.portions.each) units.add('each');
  return [...units];
}

/**
 * Converts a quantity of a unit into the food's basis amount (grams or servings).
 * Returns null when the unit cannot be resolved for this food.
 */
export function basisAmountFor(food: FoodDef, quantity: number, unit: string): number | null {
  if (!(quantity >= 0) || !Number.isFinite(quantity)) return null;
  const u = unit === '' ? food.defaultUnit : unit;
  // liquids: "oz" means fluid ounces
  if (food.liquid && u === 'oz') return basisAmountFor(food, quantity, 'fl oz');
  if (food.portions[u] != null) return quantity * food.portions[u];

  const g = massToGrams(quantity, u, false);
  if (g != null) {
    if (food.basisUnit === 'g') return g;
    if (food.portions.g) return g * food.portions.g;
    return null;
  }

  const ml = volumeToMl(quantity, u, !!food.liquid);
  if (ml != null) {
    if (food.portions.ml) return ml * food.portions.ml;
    if (food.portions.cup) return (ml / ML_PER_CUP) * food.portions.cup;
    if (food.portions['fl oz']) return (ml / ML_PER_FLOZ) * food.portions['fl oz'];
    if (food.portions.tbsp) return (ml / ML_PER_TBSP) * food.portions.tbsp;
    if (food.portions.tsp) return (ml / ML_PER_TSP) * food.portions.tsp;
    if (food.liquid && food.basisUnit === 'g') return ml; // ~1 g/ml
    return null;
  }

  // generic count words fall back to the food's natural unit
  if (['each', 'piece', 'serving'].includes(u)) {
    for (const alt of ['each', 'piece', 'slice', food.defaultUnit]) {
      if (food.portions[alt] != null) return quantity * food.portions[alt];
    }
  }
  // "a large banana" when only medium exists is unresolvable; caller decides
  if (SIZE_UNITS.includes(u) && food.portions.each) return quantity * food.portions.each;
  return null;
}

export function nutrientsFor(food: FoodDef, quantity: number, unit: string): Nutrients | null {
  const amount = basisAmountFor(food, quantity, unit);
  if (amount == null) return null;
  return scaleNutrients(food.per, amount / food.basisAmount);
}

/** Recompute an item's nutrients after a quantity or unit change, when possible. */
export function recalcItem(item: LoggedItem, food: FoodDef | undefined): Nutrients | null {
  if (food) return nutrientsFor(food, item.quantity, item.unit);
  if (item.ref && item.ref.unit === item.unit && item.ref.quantity > 0) {
    return scaleNutrients(item.ref.nutrients, item.quantity / item.ref.quantity);
  }
  return null;
}

export function itemsTotals(items: LoggedItem[]): Nutrients {
  return sumNutrients(items.map((i) => i.nutrients));
}

export function entrySource(items: LoggedItem[]): SourceType | 'mixed' {
  const set = new Set(items.map((i) => i.source));
  if (set.size === 1) return [...set][0];
  return 'mixed';
}

export function dailyTotals(entries: FoodEntry[], date: string): Nutrients {
  return sumNutrients(entries.filter((e) => e.date === date).map((e) => itemsTotals(e.items)));
}

/**
 * Remaining food budget. Exercise is deliberately not an input:
 * activity is reported separately and never extends the food allowance.
 */
export function remainingBudget(calorieTarget: number, consumedCalories: number): number {
  return calorieTarget - consumedCalories;
}

export function energyFromMacros(n: Pick<Nutrients, 'protein' | 'carbs' | 'fat'>): number {
  return n.protein * 4 + n.carbs * 4 + n.fat * 9;
}

// ---------- display ----------

export function fmtKcal(v: number): string {
  if (!Number.isFinite(v)) return '–';
  return Math.round(v).toLocaleString();
}

export function fmtGrams(v: number): string {
  if (!Number.isFinite(v)) return '–';
  if (v > 0 && v < 0.5) return '<1';
  return String(Math.round(v));
}

/** Round stored values to a sensible precision without losing much information. */
export function roundStored(n: Nutrients): Nutrients {
  const r = (v: number) => Math.round(v * 10) / 10;
  return { calories: r(n.calories), protein: r(n.protein), carbs: r(n.carbs), fat: r(n.fat), fiber: r(n.fiber) };
}

export function isValidNutrients(n: unknown): n is Nutrients {
  if (!n || typeof n !== 'object') return false;
  const o = n as Record<string, unknown>;
  return KEYS.every((k) => typeof o[k] === 'number' && Number.isFinite(o[k] as number) && (o[k] as number) >= 0);
}
