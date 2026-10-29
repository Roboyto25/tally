import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS, FOOD_BY_ID } from '../src/data/foods';
import { buildIndex, parseFoodText, defaultMealFor, DEFAULT_BOUNDARIES } from '../src/lib/parser';
import { nutrientsFor, sumNutrients, dailyTotals, remainingBudget, itemsTotals, recalcItem, isValidNutrients } from '../src/lib/nutrition';
import { parseLeadingQuantity } from '../src/lib/units';
import type { FoodEntry, LoggedItem } from '../src/lib/types';

const index = buildIndex(FOODS);
const near = (a: number, b: number, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

function entry(date: string, items: LoggedItem[], profileId = 'p1'): FoodEntry {
  return { id: Math.random().toString(36), profileId, date, time: '08:00', meal: 'breakfast', items, totals: itemsTotals(items), sourceType: 'database', estimated: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
}

test('dataset is internally sane', () => {
  const ids = new Set<string>();
  const bad: string[] = [];
  for (const f of FOODS) {
    assert.ok(!ids.has(f.id), `duplicate id ${f.id}`);
    ids.add(f.id);
    assert.ok(isValidNutrients(f.per), `${f.id} nutrients`);
    assert.ok(f.per.fiber <= f.per.carbs + 0.01, `${f.id}: fiber exceeds carbs`);
    // energy roughly consistent with macros (alcohol, fiber, and rounding excepted)
    // fiber yields ~2 kcal/g rather than 4
    const est = f.per.protein * 4 + (f.per.carbs - f.per.fiber) * 4 + f.per.fiber * 2 + f.per.fat * 9;
    if (!['spirits', 'beer', 'beer-light', 'wine-red', 'wine-white'].includes(f.id) && f.per.calories > 20) {
      if (Math.abs(est - f.per.calories) / f.per.calories >= 0.22) bad.push(`${f.id}: ${Math.round(est)} vs ${f.per.calories}`);
    }
    assert.ok(nutrientsFor(f, 1, f.defaultUnit), `${f.id}: default unit ${f.defaultUnit} unresolvable`);
  }
  assert.deepEqual(bad, [], 'energy inconsistent with macros');
  assert.ok(FOODS.length >= 150, `only ${FOODS.length} foods`);
});

test('scales nutrition by quantity', () => {
  const egg = FOOD_BY_ID['egg-whole'];
  const one = nutrientsFor(egg, 1, 'large')!;
  const two = nutrientsFor(egg, 2, 'large')!;
  near(one.calories, 71.5);
  near(two.calories, one.calories * 2, 0.001);
  near(nutrientsFor(FOOD_BY_ID['rice-white'], 100, 'g')!.calories, 130, 0.001);
  near(nutrientsFor(FOOD_BY_ID['chicken-breast'], 8, 'oz')!.protein, 70.3);
});

test('liquid ounces are fluid ounces', () => {
  const milk = FOOD_BY_ID['milk-whole'];
  const a = nutrientsFor(milk, 12, 'oz')!;
  const b = nutrientsFor(milk, 12, 'fl oz')!;
  near(a.calories, b.calories, 0.001);
  near(a.calories, 223, 3);
});

test('quantity parsing', () => {
  assert.equal(parseLeadingQuantity('2 eggs').quantity, 2);
  assert.equal(parseLeadingQuantity('two large eggs').quantity, 2);
  assert.equal(parseLeadingQuantity('1/2 cup rice').quantity, 0.5);
  assert.equal(parseLeadingQuantity('1 1/2 cups rice').quantity, 1.5);
  assert.equal(parseLeadingQuantity('½ cup oats').quantity, 0.5);
  assert.equal(parseLeadingQuantity('1½ cups oats').quantity, 1.5);
  assert.equal(parseLeadingQuantity('half an avocado').quantity, 0.5);
  assert.equal(parseLeadingQuantity('2.5 oz chicken').quantity, 2.5);
  assert.equal(parseLeadingQuantity('8oz steak').quantity, 8);
  const pct = parseLeadingQuantity('2% milk');
  assert.equal(pct.matched, false);
  const lean = parseLeadingQuantity('80/20 ground beef');
  assert.equal(lean.matched, false);
});

function names(text: string) {
  return parseFoodText(text, index).lines.map((l) => l.item?.foodId ?? `?${l.raw}`);
}

test('parses the spec examples', () => {
  const a = parseFoodText('Two scrambled eggs, three slices of bacon, and two pieces of toast with butter.', index);
  assert.deepEqual(a.lines.map((l) => l.item?.foodId), ['egg-scrambled', 'bacon', 'bread-white', 'butter']);
  assert.equal(a.lines[0].item!.quantity, 2);
  assert.equal(a.lines[1].item!.quantity, 3);
  assert.equal(a.lines[2].item!.quantity, 2);
  assert.equal(a.lines[3].item!.estimated, true); // butter amount not given

  const b = parseFoodText('An 8 oz grilled chicken breast, a medium baked potato, and a tablespoon of butter.', index);
  assert.deepEqual(b.lines.map((l) => [l.item?.foodId, l.item?.quantity, l.item?.unit]), [
    ['chicken-breast', 8, 'oz'],
    ['potato-baked', 1, 'medium'],
    ['butter', 1, 'tbsp'],
  ]);
  assert.ok(b.lines.every((l) => l.status === 'matched'));

  const c = parseFoodText('A protein shake with two scoops of whey and 12 oz of whole milk.', index);
  assert.deepEqual(c.lines.map((l) => [l.item?.foodId, l.item?.quantity]), [
    ['whey', 2],
    ['milk-whole', 12],
  ]);

  const d = parseFoodText('A handful of almonds and a medium banana.', index);
  assert.deepEqual(d.lines.map((l) => l.item?.foodId), ['almonds', 'banana']);
  assert.equal(d.lines[0].item!.estimated, true);

  const e = parseFoodText('A Chipotle chicken bowl with white rice, black beans, cheese, and sour cream.', index);
  assert.equal(e.restaurant, true);
  assert.ok(e.lines.some((l) => l.item?.foodId === 'rice-white'));
});

test('parses multiline input and synonyms', () => {
  assert.deepEqual(names('2 large eggs\n1 cup of coffee\nhalf an avocado'), ['egg-whole', 'coffee', 'avocado']);
  assert.deepEqual(names('mac and cheese and a glass of 2% milk'), ['mac-cheese', 'milk-2']);
  assert.deepEqual(names('1 cup greek yogurt with blueberries'), ['greek-nonfat', 'blueberries']);
  assert.deepEqual(names('salt and pepper'), ['salt', 'black-pepper']);
  assert.deepEqual(names('6 oz 93/7 ground beef'), ['beef-ground-93']);
  assert.deepEqual(names('a bananna'), ['banana']); // single-letter typo
});

test('does not invent matches for unknown foods', () => {
  const r = parseFoodText('a bowl of grandma’s special goulash', index);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].status, 'unmatched');
  assert.equal(r.lines[0].item, undefined);
});

test('assumed generic matches are flagged for review', () => {
  const r = parseFoodText('chicken and rice', index);
  assert.ok(r.lines.every((l) => l.status === 'review'));
  assert.ok(r.lines[0].notes.some((n) => n.includes('assumed')));
});

test('unsupported unit asks for a unit instead of guessing', () => {
  const r = parseFoodText('2 scoops of black beans', index);
  assert.equal(r.lines[0].needsUnit, true);
});

test('combines foods, daily totals, and budget', () => {
  const egg = FOOD_BY_ID['egg-whole'];
  const toast = FOOD_BY_ID['bread-white'];
  const i1 = { id: 'a', name: 'egg', quantity: 2, unit: 'large', foodId: egg.id, nutrients: nutrientsFor(egg, 2, 'large')!, source: 'database' as const, estimated: false };
  const i2 = { id: 'b', name: 'toast', quantity: 1, unit: 'slice', foodId: toast.id, nutrients: nutrientsFor(toast, 1, 'slice')!, source: 'database' as const, estimated: false };
  const meal = sumNutrients([i1.nutrients, i2.nutrients]);
  near(meal.calories, 143 + 74.5);
  const entries = [entry('2026-03-01', [i1, i2]), entry('2026-03-01', [i1]), entry('2026-03-02', [i2])];
  const day = dailyTotals(entries, '2026-03-01');
  near(day.calories, meal.calories + i1.nutrients.calories, 0.001);
  assert.equal(remainingBudget(2000, day.calories), 2000 - day.calories);
  // deletion removes from totals
  const after = dailyTotals(entries.slice(1), '2026-03-01');
  near(after.calories, i1.nutrients.calories, 0.001);
  // edits update totals
  const edited = { ...i1, quantity: 3, nutrients: recalcItem({ ...i1, quantity: 3 }, egg)! };
  near(dailyTotals([entry('2026-03-01', [edited])], '2026-03-01').calories, 214.5);
});

test('AI items rescale from their reference serving only when units match', () => {
  const item: LoggedItem = { id: 'x', name: 'Burrito', quantity: 1, unit: 'each', nutrients: { calories: 900, protein: 40, carbs: 100, fat: 35, fiber: 12 }, source: 'ai', estimated: true, ref: { quantity: 1, unit: 'each', nutrients: { calories: 900, protein: 40, carbs: 100, fat: 35, fiber: 12 } } };
  assert.equal(recalcItem({ ...item, quantity: 0.5 }, undefined)!.calories, 450);
  assert.equal(recalcItem({ ...item, unit: 'cup' }, undefined), null);
});

test('default meal category by time', () => {
  const at = (h: number, m = 0) => new Date(2026, 0, 5, h, m);
  assert.equal(defaultMealFor(at(7), DEFAULT_BOUNDARIES), 'breakfast');
  assert.equal(defaultMealFor(at(12, 30)), 'lunch');
  assert.equal(defaultMealFor(at(18)), 'dinner');
  assert.equal(defaultMealFor(at(15, 30)), 'snack');
  assert.equal(defaultMealFor(at(23)), 'snack');
});
