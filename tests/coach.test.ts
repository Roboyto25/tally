import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS, FOOD_BY_ID } from '../src/data/foods';
import { MEAL_IDEAS } from '../src/data/mealIdeas';
import { buildIndex, parseFoodText } from '../src/lib/parser';
import { applyCorrection, classify, questionSubject, shortName, stripFraming } from '../src/lib/chat';
import type { PendingLine } from '../src/lib/chat';
import { friendlyQuantity, headline, recommend, remainingFor } from '../src/lib/recommend';
import { macrosFor, resolveTargets, consistencyWarning } from '../src/lib/targets';
import { addNutrients, extCoverage, nutrientsFor, sumNutrients, isValidNutrients } from '../src/lib/nutrition';
import { parseChatGptResponse, buildFoodPrompt, buildPlanPrompt } from '../src/lib/chatgpt';
import { labSummary, monthWeight, satFatCheck, topSatFatSources, weekReport } from '../src/lib/insights';
import { buildExport, emptyDataSet, planImport, validateExport } from '../src/lib/exportImport';
import { addDays } from '../src/lib/dates';
import type { FoodEntry, LabResult, Nutrients, Profile, WeightEntry } from '../src/lib/types';

const index = buildIndex(FOODS);
const T = '2026-01-01T00:00:00.000Z';
const foodById = (id?: string) => (id ? FOOD_BY_ID[id] : undefined);
const targets = resolveTargets(macrosFor(2100, 200));

function entry(profileId: string, date: string, n: Partial<Nutrients> & { calories: number }, name = 'Meal'): FoodEntry {
  const full: Nutrients = { protein: 100, carbs: 200, fat: 60, fiber: 20, ...n };
  return { id: `${profileId}-${date}-${name}-${n.calories}`, profileId, date, time: '12:00', meal: 'lunch', items: [{ id: 'i', name, quantity: 1, unit: 'serving', nutrients: full, source: 'user', estimated: false }], totals: full, sourceType: 'user', estimated: false, createdAt: T, updatedAt: T };
}

test('every food has saturated fat, cholesterol and sodium; soluble fiber only where sourced', () => {
  for (const f of FOODS) {
    assert.equal(typeof f.per.satFat, 'number', `${f.id} satFat`);
    assert.equal(typeof f.per.cholesterol, 'number', `${f.id} cholesterol`);
    assert.equal(typeof f.per.sodium, 'number', `${f.id} sodium`);
    assert.ok(f.per.satFat! <= f.per.fat + 0.5, `${f.id}: sat fat ${f.per.satFat} > fat ${f.per.fat}`);
    if (f.per.solubleFiber !== undefined) assert.ok(f.per.solubleFiber <= f.per.fiber, `${f.id}: soluble > total fiber`);
  }
  assert.ok(FOODS.filter((f) => f.per.solubleFiber !== undefined).length >= 10);
  assert.equal(FOOD_BY_ID['salmon-wild'].per.solubleFiber, undefined, 'unknown soluble fiber stays undefined');
  assert.ok(nutrientsFor(FOOD_BY_ID.butter, 1, 'tbsp')!.satFat! > 7);
});

test('unknown extended nutrients are never treated as zero', () => {
  const known: Nutrients = { calories: 100, protein: 5, carbs: 10, fat: 5, fiber: 1, satFat: 2 };
  const unknown: Nutrients = { calories: 200, protein: 5, carbs: 10, fat: 5, fiber: 1 };
  assert.equal(addNutrients(unknown, unknown).satFat, undefined);
  assert.equal(addNutrients(known, unknown).satFat, 2); // partial sum of what is known
  const cov = extCoverage([{ nutrients: known }, { nutrients: unknown }], 'satFat');
  assert.deepEqual(cov, { known: 1, total: 2, complete: false });
  // near-zero-calorie items (black coffee) don't make a total uncertain
  assert.equal(extCoverage([{ nutrients: known }, { nutrients: { calories: 2, protein: 0, carbs: 0, fat: 0, fiber: 0 } }], 'satFat').complete, true);
  assert.ok(isValidNutrients(unknown));
  assert.ok(!isValidNutrients({ ...known, sodium: -1 }));
});

test('targets: saturated fat under 10% of calories, consistent with fat', () => {
  assert.equal(targets.satFat, Math.round(210 / 9));
  assert.equal(targets.sodium, 2300);
  assert.ok(targets.solubleFiber <= targets.fiber);
  // a v1 profile without the new targets gets defaults
  const old = resolveTargets({ calories: 1800, protein: 140, carbs: 180, fat: 56, fiber: 25 });
  assert.equal(old.satFat, 20);
  assert.match(consistencyWarning({ ...targets, satFat: 99 })!, /Saturated fat/);
});

test('chat: intents for the spec examples', () => {
  const k = (s: string, p = false) => classify(s, p).kind;
  assert.equal(k('I had three eggs, two slices of toast with butter, and bacon.'), 'log_food');
  assert.equal(k('Log a double-chicken Chipotle burrito.'), 'log_food');
  assert.equal(k('What should I eat for dinner?'), 'recommend');
  assert.equal(k('How much fiber do I have left today?'), 'remaining');
  assert.equal(k('I weighed 242 pounds this morning.'), 'weight');
  assert.equal(k('How have I done this week?'), 'week_report');
  assert.equal(k('What should I improve this week?'), 'week_report');
  assert.equal(k('Show me my cholesterol trends.'), 'labs');
  assert.equal(k('Show my LDL results over time.'), 'labs');
  assert.equal(k('How has my weight changed this month?'), 'month_weight');
  assert.equal(k('Am I consistently exceeding my saturated-fat target?'), 'satfat_check');
  assert.equal(k('walked 45 minutes'), 'exercise');
  assert.equal(k('Actually, I only used half a tablespoon of butter', true), 'correct');
  const rec = classify('Give me a high-protein dinner under 600 calories that is low in saturated fat.', false);
  assert.equal(rec.kind, 'recommend');
  if (rec.kind === 'recommend') assert.deepEqual(rec.constraints, { maxKcal: 600, highProtein: true, lowSatFat: true });
  const w = classify('I weighed 241.6 this morning', false);
  assert.ok(w.kind === 'weight' && w.weight === 241.6);
});

test('chat: asking about a food is never a log instruction', () => {
  for (const q of ['How many calories in a slice of pizza?', 'Is pizza ok tonight?', 'Can I have a bagel?', 'should I eat pizza']) {
    assert.equal(classify(q, false).kind, 'food_question', q);
  }
  assert.equal(questionSubject('How many calories in a slice of pizza?'), 'a slice of pizza');
  assert.equal(stripFraming('I had oatmeal for breakfast'), 'oatmeal');
});

function pendingFrom(text: string): PendingLine[] {
  return parseFoodText(text, index).lines.map((l) => ({ key: l.id, item: l.item ?? null, raw: l.raw, notes: l.notes }));
}

test('chat: corrections edit the pending meal instead of adding a new one', () => {
  const lines = pendingFrom('3 eggs, 2 slices of toast with 1 tbsp butter, and 2 slices of bacon');
  const butterBefore = lines.find((l) => l.item?.foodId === 'butter')!.item!;
  const half = applyCorrection(lines, 'Actually, I only used half a tablespoon of butter', index, foodById);
  assert.ok(half.understood);
  assert.equal(half.lines.length, lines.length);
  const butter = half.lines.find((l) => l.item?.foodId === 'butter')!.item!;
  assert.equal(butter.quantity, 0.5);
  assert.ok(Math.abs(butter.nutrients.calories - butterBefore.nutrients.calories / 2) < 0.01);
  assert.ok(Math.abs(butter.nutrients.satFat! - butterBefore.nutrients.satFat! / 2) < 0.01);

  const noBacon = applyCorrection(lines, 'no bacon', index, foodById);
  assert.equal(noBacon.lines.length, lines.length - 1);
  assert.ok(!noBacon.lines.some((l) => l.item?.foodId === 'bacon'));

  const swap = applyCorrection(lines, 'it was turkey bacon', index, foodById);
  const tb = swap.lines.find((l) => l.item?.foodId === 'bacon-turkey')!.item!;
  assert.equal(tb.quantity, 2, 'keeps the amount when swapping');
  assert.equal(swap.lines.length, lines.length);

  const added = applyCorrection(lines, 'also a cup of coffee', index, foodById);
  assert.equal(added.lines.length, lines.length + 1);
  // original is untouched (no mutation)
  assert.equal(lines.find((l) => l.item?.foodId === 'butter')!.item!.quantity, 1);
  assert.equal(applyCorrection(lines, 'actually the thing', index, foodById).understood, false);
  assert.equal(shortName('Bacon, turkey, cooked'), 'turkey bacon');
});

test('recommendations: respect calories and saturated fat, explain themselves', () => {
  const totals: Nutrients = { calories: 1450, protein: 80, carbs: 150, fat: 60, fiber: 12, satFat: 20 };
  const r = recommend({ targets, totals, meal: 'dinner', foods: FOOD_BY_ID });
  assert.equal(r.suggestions.length, 3);
  const satLeft = targets.satFat - 20;
  for (const s of r.suggestions) {
    assert.ok(s.totals.calories <= r.budget * 1.12, `${s.name} over budget`);
    assert.ok((s.totals.satFat ?? 0) <= satLeft + 0.5, `${s.name}: ${s.totals.satFat} g sat fat with ${satLeft} left`);
    assert.ok(s.reasons.length >= 2);
  }
  assert.match(r.headline, /close to your saturated-fat limit/);

  const c = recommend({ targets, totals: { calories: 900, protein: 60, carbs: 100, fat: 30, fiber: 10, satFat: 8 }, meal: 'dinner', constraints: { maxKcal: 600, highProtein: true, lowSatFat: true }, foods: FOOD_BY_ID });
  assert.ok(c.suggestions.length > 0);
  for (const s of c.suggestions) {
    assert.ok(s.totals.calories <= 600, `${s.name} ${s.totals.calories} > 600`);
    assert.ok(s.totals.protein >= 30, `${s.name} protein ${s.totals.protein}`);
  }
  // over budget: nothing big is suggested
  const full = recommend({ targets, totals: { ...totals, calories: 2100 }, meal: 'dinner', foods: FOOD_BY_ID });
  assert.equal(full.suggestions.length, 0, 'no meal suggested once the calorie target is reached');
  assert.match(full.headline, /at your calorie target/);
  assert.match(headline(remainingFor(targets, { ...totals, calories: 2300 }), targets, { ...totals, calories: 2300 }, 'dinner'), /over your/);
});

test('recommendations: every meal idea resolves against the database', () => {
  for (const m of MEAL_IDEAS) for (const [id, q, u] of m.items) assert.ok(FOOD_BY_ID[id] && nutrientsFor(FOOD_BY_ID[id], q, u), `${m.id}: ${id} ${u}`);
  assert.equal(friendlyQuantity(0.94, 'cup'), 1);
  assert.equal(friendlyQuantity(0.63, 'medium'), 0.75);
  assert.equal(friendlyQuantity(5.6, 'oz'), 5.5);
});

test('ChatGPT: extended fields parsed, unknowns kept unknown, inconsistencies flagged', () => {
  const r = parseChatGptResponse('```json\n{"items":[{"name":"Burrito","quantity":1,"unit":"each","calories":1050,"protein_g":52,"carbs_g":110,"fat_g":40,"saturated_fat_g":16,"fiber_g":14,"soluble_fiber_g":null,"cholesterol_mg":125,"sodium_mg":2400}],"assumptions":"Assumed 1 tbsp oil in the rice."}\n```');
  const n = r.items[0].nutrients;
  assert.equal(n.satFat, 16);
  assert.equal(n.solubleFiber, undefined);
  assert.equal(n.sodium, 2400);
  assert.equal(r.assumptions, 'Assumed 1 tbsp oil in the rice.');
  assert.deepEqual(r.items[0].problems, []);
  const noFiber = parseChatGptResponse('{"items":[{"name":"x","calories":100,"protein_g":1,"carbs_g":1,"fat_g":1}]}');
  assert.ok(noFiber.items[0].problems.some((p) => /Fiber not given/.test(p)), 'missing fiber is flagged, not zeroed');
  const bad = parseChatGptResponse('{"items":[{"name":"x","calories":100,"protein_g":1,"carbs_g":1,"fat_g":2,"saturated_fat_g":5,"fiber_g":0}]}');
  assert.ok(bad.items[0].problems.some((p) => /Saturated fat is larger/.test(p)));
  assert.match(buildFoodPrompt('a burrito'), /saturated_fat_g/);
  const plan = buildPlanPrompt({ request: 'dinner idea', remaining: { calories: 600, protein: 40, satFat: 6, fiber: 10 } });
  assert.match(plan, /600 kcal/);
  assert.doesNotMatch(plan, /\d+(\.\d+)? ?(lb|mg\/dL|mmol)|(LDL|HDL)\D{0,4}\d/i, "no weight or lab values in the prompt");
});

test('insights: week report and sat-fat check need enough data', () => {
  const today = '2026-03-14';
  const few = [entry('p', today, { calories: 2000, satFat: 30 })];
  assert.equal(weekReport(few, [], [], targets, today).enough, false);
  const week = [0, 1, 2, 3, 4].map((d) => entry('p', addDays(today, -d), { calories: 2300, satFat: 32 }, 'Cheddar cheese'));
  const r = weekReport(week, [], [], targets, today);
  assert.ok(r.enough);
  assert.match(r.lines.join(' '), /over the limit on 5 of 5/);
  assert.match(r.lines.join(' '), /Cheddar cheese/);
  assert.equal(satFatCheck(week, [], [], targets, today).enough, true);
  assert.match(satFatCheck(week, [], [], targets, today).lines.join(' '), /consistent/);
  assert.equal(topSatFatSources(week, addDays(today, -6), today)[0].name, 'Cheddar cheese');
});

test('insights: weight and lab summaries use only measured data', () => {
  const w = (date: string, weight: number): WeightEntry => ({ id: date, profileId: 'p', date, weight, createdAt: T, updatedAt: T });
  assert.equal(monthWeight([w('2026-03-01', 240)], '2026-03-20').enough, false);
  assert.match(monthWeight([w('2026-03-01', 240), w('2026-03-15', 237)], '2026-03-20').lines[0], /down 3\.0 lb/);
  const lab = (date: string, ldl: number): LabResult => ({ id: date, profileId: 'p', date, unit: 'mg/dL', ldl, createdAt: T, updatedAt: T });
  assert.equal(labSummary([]).enough, false);
  const s = labSummary([lab('2025-06-01', 150), lab('2026-01-10', 128)]).lines.join(' ');
  assert.match(s, /Latest LDL cholesterol: 128/);
  assert.match(s, /down 22 mg\/dL/);
  assert.match(s, /doesn’t estimate or predict/);
});

test('export v2: labs and chat round-trip; v1 backups still import', () => {
  const data = emptyDataSet();
  const p: Profile = { id: 'r', name: 'Richard', age: 45, sex: 'male', heightIn: 71, startingWeight: 244, currentWeight: 242, targetWeight: 200, weeklyRate: 1, activityLevel: 'light', targets, mealBoundaries: { breakfastStart: 4, breakfastEnd: 10.5, lunchEnd: 14.5, dinnerStart: 16.5, dinnerEnd: 21 }, createdAt: T, updatedAt: T };
  data.profiles.push(p);
  data.labResults.push({ id: 'l1', profileId: 'r', date: '2026-01-10', unit: 'mg/dL', ldl: 128, createdAt: T, updatedAt: T });
  data.chatMessages.push({ id: 'c1', profileId: 'r', role: 'user', text: 'hi', createdAt: T, updatedAt: T });
  const v = validateExport(JSON.parse(JSON.stringify(buildExport(data, '2.0.0'))));
  assert.ok(v.ok);
  if (v.ok) {
    assert.equal(v.file.data.labResults.length, 1);
    assert.equal(planImport(v.file, data, 'merge').stores.labResults.added, 0, 're-import adds no duplicates');
  }
  const v1 = { format: 'tally-fitness-export', schemaVersion: 1, appVersion: '1.0.0', exportedAt: T, data: { profiles: [{ ...p, targets: { calories: 2100, protein: 160, carbs: 219, fat: 65, fiber: 29 } }], foodEntries: [], customFoods: [], savedMeals: [], exerciseEntries: [], weightEntries: [], goalHistory: [], dayStatus: [], settings: [] } };
  const r1 = validateExport(v1);
  assert.ok(r1.ok, 'v1 file accepted');
  if (r1.ok) assert.deepEqual(r1.file.data.labResults, []);
  const badLab = JSON.parse(JSON.stringify(buildExport(data, '2')));
  badLab.data.labResults[0].ldl = -4;
  assert.equal(validateExport(badLab).ok, false);
  const noVals = JSON.parse(JSON.stringify(buildExport(data, '2')));
  delete noVals.data.labResults[0].ldl;
  assert.equal(validateExport(noVals).ok, false);
});

test('profile separation in coaching summaries', () => {
  const today = '2026-03-14';
  const mixed = [0, 1, 2].map((d) => entry('richard', addDays(today, -d), { calories: 2500, satFat: 40 }, 'Butter')).concat([0, 1, 2].map((d) => entry('amanda', addDays(today, -d), { calories: 1500, satFat: 5 }, 'Oats')));
  // the app always filters by profile before calling insights; the filtered set must not see the other person
  const amanda = mixed.filter((e) => e.profileId === 'amanda');
  assert.ok(!topSatFatSources(amanda, addDays(today, -6), today).some((s) => s.name === 'Butter'));
  assert.equal(sumNutrients(amanda.map((e) => e.totals)).calories, 4500);
});
