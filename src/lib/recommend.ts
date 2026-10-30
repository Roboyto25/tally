import type { FoodDef, LoggedItem, MealBoundaries, MealCategory, Nutrients, SavedMeal } from './types';
import { MEAL_LABEL } from './types';
import { nutrientsFor, sumNutrients, scaleNutrients } from './nutrition';
import type { FullTargets } from './targets';
import { MEAL_IDEAS } from '../data/mealIdeas';
import type { MealIdea } from '../data/mealIdeas';
import { uid } from './id';

/**
 * Deterministic "what to eat next" engine. No AI: it reads confirmed totals,
 * works out what's left, and ranks portioned meal ideas from the local database.
 *
 * Priorities (in order, per the coaching goals):
 *   1. stay within the calorie target
 *   2. keep saturated fat low; prefer unsaturated fats
 *   3. add fiber, especially soluble fiber
 *   4. meet protein
 *   5. keep sodium reasonable
 */

export interface Constraints {
  maxKcal?: number;
  minProtein?: number;
  highProtein?: boolean;
  lowSatFat?: boolean;
  highFiber?: boolean;
}

export interface Remaining {
  calories: number;
  protein: number;
  satFat: number;
  fiber: number;
  solubleFiber: number;
  sodium: number;
}

export interface Suggestion {
  id: string;
  name: string;
  meal: MealCategory;
  scale: number;
  items: LoggedItem[];
  totals: Nutrients;
  score: number;
  reasons: string[];
  fromSaved?: boolean;
}

export interface RecResult {
  meal: MealCategory;
  budget: number;
  remaining: Remaining;
  headline: string;
  focus: string[];
  suggestions: Suggestion[];
}

export function remainingFor(targets: FullTargets, totals: Nutrients): Remaining {
  return {
    calories: targets.calories - totals.calories,
    protein: targets.protein - totals.protein,
    satFat: targets.satFat - (totals.satFat ?? 0),
    fiber: targets.fiber - totals.fiber,
    solubleFiber: targets.solubleFiber - (totals.solubleFiber ?? 0),
    sodium: targets.sodium - (totals.sodium ?? 0),
  };
}

/** Next meal by local time, using the profile's meal windows. */
export function nextMeal(now: Date, b: MealBoundaries, eaten: Set<MealCategory>): MealCategory {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < b.breakfastEnd && !eaten.has('breakfast')) return 'breakfast';
  if (h < b.lunchEnd && !eaten.has('lunch')) return 'lunch';
  if (h < b.dinnerEnd && !eaten.has('dinner')) return 'dinner';
  return 'snack';
}

const SHARE: Record<MealCategory, number> = { breakfast: 0.25, lunch: 0.33, dinner: 0.4, snack: 0.1 };

export function mealBudget(meal: MealCategory, target: number, remainingKcal: number, maxKcal?: number): number {
  let b: number;
  if (meal === 'dinner') b = remainingKcal - Math.min(150, Math.max(0, remainingKcal - 450)); // leave room for a small snack
  else if (meal === 'snack') b = Math.min(250, remainingKcal);
  else b = Math.min(remainingKcal, Math.round(target * SHARE[meal]));
  if (maxKcal) b = Math.min(b, maxKcal);
  return Math.max(0, Math.round(b));
}

const UNSATURATED = new Set(['olive-oil', 'vegetable-oil', 'walnuts', 'almonds', 'avocado', 'salmon-wild', 'salmon-farmed', 'chia', 'peanut-butter', 'edamame', 'tofu', 'hummus']);

/** Rounds scaled portions to amounts a person would actually measure. */
export function friendlyQuantity(q: number, unit: string): number {
  const step = unit === 'g' || unit === 'ml' ? 5 : unit === 'cup' ? 0.25 : unit === 'oz' || unit === 'tbsp' || unit === 'tsp' ? 0.5 : unit === 'slice' || unit === 'large' || unit === 'scoop' || unit === 'spear' ? 1 : 0.25;
  return Math.max(step, Math.round(q / step) * step);
}

function itemsFor(idea: MealIdea, foods: Record<string, FoodDef>, scale: number): LoggedItem[] | null {
  const out: LoggedItem[] = [];
  for (const [id, q, unit] of idea.items) {
    const f = foods[id];
    if (!f) return null;
    const quantity = friendlyQuantity(q * scale, unit);
    const n = nutrientsFor(f, quantity, unit);
    if (!n) return null;
    out.push({ id: uid(), name: f.name, quantity, unit, foodId: f.id, nutrients: n, source: 'database', estimated: false });
  }
  return out;
}

interface Scored {
  score: number;
  reasons: string[];
}

function scoreMeal(t: Nutrients, r: Remaining, budget: number, c: Constraints, unsat: boolean, familiar: number): Scored | null {
  const reasons: string[] = [];
  let s = 0;
  const kcal = t.calories;
  // 1. calories: with nothing left, suggest nothing rather than something that breaks the target
  if (budget < 60) return null;
  {
    if (kcal > budget * 1.12) return null; // never suggest something that blows the budget
    if (c.maxKcal && kcal > c.maxKcal) return null; // an explicit "under N calories" is a hard limit
    s -= (Math.abs(kcal - budget) / budget) * 30;
  }
  // 2. saturated fat
  const sat = t.satFat ?? 0;
  const satLeft = Math.max(0, r.satFat);
  s -= (sat / Math.max(1, satLeft)) * (c.lowSatFat ? 50 : 25);
  if (sat > satLeft + 0.5) s -= c.lowSatFat ? 80 : 40;
  if (unsat) s += 4;
  // 3. fiber
  const fGap = Math.max(0, r.fiber);
  s += (Math.min(t.fiber, fGap) / Math.max(5, fGap)) * (c.highFiber ? 35 : 20);
  s += Math.min(8, (t.solubleFiber ?? 0) * 2);
  // 4. protein
  const pGap = Math.max(0, r.protein);
  s += (Math.min(t.protein, pGap) / Math.max(10, pGap)) * (c.highProtein ? 40 : 22);
  if (c.highProtein && t.protein < 30) s -= 25;
  if (c.minProtein && t.protein < c.minProtein) return null;
  // 5. sodium
  if ((t.sodium ?? 0) > Math.max(0, r.sodium)) s -= 8;
  s += Math.min(6, familiar * 3);

  // reasons, most decision-relevant first
  if (budget > 0) reasons.push(`About ${Math.round(kcal / 10) * 10} kcal, fits the ~${Math.round(budget / 10) * 10} kcal you have for this ${budget < 300 ? 'snack' : 'meal'}.`);
  if (sat <= Math.max(2, satLeft * 0.35)) reasons.push(`Low in saturated fat (${sat.toFixed(1)} g${satLeft > 0 ? ` of ${Math.round(satLeft)} g left` : ''})${unsat ? ', fat mostly from unsaturated sources' : ''}.`);
  else if (unsat) reasons.push(`Fat comes mostly from unsaturated sources; ${sat.toFixed(1)} g saturated.`);
  if (t.fiber >= 5) reasons.push(`${Math.round(t.fiber)} g fiber${t.solubleFiber ? `, about ${t.solubleFiber.toFixed(1)} g soluble` : ''}${fGap > 0 ? ` toward the ${Math.round(fGap)} g you still need` : ''}.`);
  if (t.protein >= 20) reasons.push(`${Math.round(t.protein)} g protein${pGap > 0 ? ` (${Math.round(pGap)} g still to go today)` : ''}.`);
  return { score: s, reasons: reasons.slice(0, 3) };
}

export interface RecInput {
  targets: FullTargets;
  totals: Nutrients;
  meal: MealCategory;
  constraints?: Constraints;
  foods: Record<string, FoodDef>;
  savedMeals?: SavedMeal[];
  recentFoodIds?: string[];
  /** foods eaten today, to add a little variety */
  todayFoodIds?: string[];
  limit?: number;
}

export function recommend(input: RecInput): RecResult {
  const { targets, totals, meal, foods } = input;
  const c = input.constraints ?? {};
  const remaining = remainingFor(targets, totals);
  const budget = mealBudget(meal, targets.calories, remaining.calories, c.maxKcal);
  const recent = new Set(input.recentFoodIds ?? []);
  const today = new Set(input.todayFoodIds ?? []);
  const pool: Suggestion[] = [];

  const ideas = MEAL_IDEAS.filter((m) => m.meals.includes(meal) || (budget < 300 && m.meals.includes('snack')));
  for (const idea of ideas) {
    let best: Suggestion | null = null;
    for (const scale of [0.75, 1, 1.25, 1.5]) {
      const items = itemsFor(idea, foods, scale);
      if (!items) break;
      const t = sumNutrients(items.map((i) => i.nutrients));
      const unsat = idea.items.some(([id]) => UNSATURATED.has(id));
      const familiar = idea.items.filter(([id]) => recent.has(id)).length;
      const sc = scoreMeal(t, remaining, budget, c, unsat, familiar);
      if (!sc) continue;
      const repeat = idea.items.filter(([id]) => today.has(id)).length;
      const score = sc.score - repeat * 2 - Math.abs(scale - 1) * 3;
      if (!best || score > best.score) best = { id: idea.id, name: idea.name, meal, scale, items, totals: t, score, reasons: sc.reasons };
    }
    if (best) pool.push(best);
  }

  // the user's own saved meals compete too, so recommendations reflect what they actually eat
  for (const m of input.savedMeals ?? []) {
    const t = sumNutrients(m.items.map((i) => i.nutrients));
    const sc = scoreMeal(t, remaining, budget, c, false, 2);
    if (sc) pool.push({ id: `saved:${m.id}`, name: m.name, meal, scale: 1, items: m.items.map((i) => ({ ...i, id: uid() })), totals: t, score: sc.score + 3, reasons: ['One of your saved meals.', ...sc.reasons].slice(0, 3), fromSaved: true });
  }

  pool.sort((a, b) => b.score - a.score);
  const suggestions = pool.slice(0, input.limit ?? 3);
  return { meal, budget, remaining, headline: headline(remaining, targets, totals, meal), focus: focusAreas(remaining, targets), suggestions };
}

function focusAreas(r: Remaining, t: FullTargets): string[] {
  const f: string[] = [];
  if (r.calories <= 0) f.push('calories');
  if (r.satFat <= t.satFat * 0.25) f.push('satFat');
  if (r.fiber > t.fiber * 0.4) f.push('fiber');
  if (r.protein > t.protein * 0.4) f.push('protein');
  return f;
}

/** One or two plain sentences summarizing where the day stands and what matters next. */
export function headline(r: Remaining, t: FullTargets, totals: Nutrients, meal: MealCategory): string {
  const parts: string[] = [];
  const kcal = Math.round(r.calories / 10) * 10;
  if (r.calories < 0) parts.push(`You’re about ${Math.abs(kcal).toLocaleString()} kcal over your ${t.calories.toLocaleString()} kcal target today.`);
  else if (r.calories < 60) parts.push('You’re at your calorie target for today.');
  else parts.push(`You have about ${kcal.toLocaleString()} kcal left today.`);
  if (r.calories < 60) {
    parts.push('If you’re still hungry, raw vegetables or a cup of broth add very little; otherwise, tomorrow is a fresh budget.');
    return parts.join(' ');
  }
  const sat = totals.satFat ?? 0;
  if (r.satFat <= 0) parts.push(`Saturated fat is at ${Math.round(sat)} g, over your ${t.satFat} g limit, so keep the rest of the day low in butter, cheese, fatty meat, and coconut oil.`);
  else if (r.satFat <= t.satFat * 0.25) parts.push(`You’re close to your saturated-fat limit (${Math.round(sat)} of ${t.satFat} g).`);
  const needs: string[] = [];
  if (r.protein > 10) needs.push(`${Math.round(r.protein)} g protein`);
  if (r.fiber > 4) needs.push(`${Math.round(r.fiber)} g fiber`);
  if (needs.length) parts.push(`Still to go: ${needs.join(' and ')}.`);
  if (r.calories > 120) {
    const hint = r.satFat <= t.satFat * 0.25 ? 'lean on fish, poultry, beans, vegetables, and olive oil' : r.fiber > t.fiber * 0.4 ? 'add beans, lentils, oats, or fruit for fiber' : r.protein > t.protein * 0.4 ? 'make protein the center of the plate' : 'keep it balanced';
    parts.push(`For ${MEAL_LABEL[meal].toLowerCase().replace('snacks', 'a snack')}, ${hint}.`);
  }
  return parts.join(' ');
}

/** Scales a suggestion's items (used when the user taps a smaller/larger portion). */
export function scaleSuggestion(s: Suggestion, factor: number): Suggestion {
  const items = s.items.map((i) => ({ ...i, quantity: Math.round(i.quantity * factor * 100) / 100, nutrients: scaleNutrients(i.nutrients, factor) }));
  return { ...s, items, totals: sumNutrients(items.map((i) => i.nutrients)) };
}
