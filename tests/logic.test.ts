import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bmrMifflin, computeTargets, consistencyWarning, macrosFor } from '../src/lib/targets';
import { estimateExercise } from '../src/lib/exercise';
import { linearTrend, recommendAdjustment, weightStats, projectTargetDate } from '../src/lib/weight';
import { aggregate, summarizeDays, previousPeriod, weightChangeInRange } from '../src/lib/progress';
import { buildExport, emptyDataSet, planImport, validateExport, foodCsv } from '../src/lib/exportImport';
import { parseChatGptResponse, buildFoodPrompt } from '../src/lib/chatgpt';
import { remainingBudget, energyFromMacros } from '../src/lib/nutrition';
import { addDays } from '../src/lib/dates';
import type { ExerciseEntry, FoodEntry, Profile, WeightEntry } from '../src/lib/types';

const T = '2026-01-01T00:00:00.000Z';

function profile(id: string, name: string): Profile {
  return { id, name, age: 45, sex: 'male', heightIn: 70, startingWeight: 220, currentWeight: 220, targetWeight: 190, weeklyRate: 1, activityLevel: 'light', targets: { calories: 2200, protein: 152, carbs: 230, fat: 68, fiber: 31 }, mealBoundaries: { breakfastStart: 4, breakfastEnd: 10.5, lunchEnd: 14.5, dinnerStart: 16.5, dinnerEnd: 21 }, createdAt: T, updatedAt: T };
}
function w(profileId: string, date: string, weight: number): WeightEntry {
  return { id: `${profileId}-${date}`, profileId, date, weight, createdAt: T, updatedAt: T };
}
function food(profileId: string, date: string, calories: number, id = `${profileId}-${date}-${calories}`): FoodEntry {
  const n = { calories, protein: 100, carbs: 200, fat: 60, fiber: 25 };
  return { id, profileId, date, time: '12:00', meal: 'lunch', items: [{ id: 'i' + id, name: 'Meal', quantity: 1, unit: 'serving', nutrients: n, source: 'user', estimated: false }], totals: n, sourceType: 'user', estimated: false, createdAt: T, updatedAt: T };
}

test('Mifflin–St Jeor matches published examples', () => {
  // 80 kg, 180 cm, 30 y male = 800 + 1125 - 150 + 5 = 1780
  assert.ok(Math.abs(bmrMifflin('male', 80 / 0.45359237, 180 / 2.54, 30) - 1780) < 0.01);
  assert.ok(Math.abs(bmrMifflin('female', 80 / 0.45359237, 180 / 2.54, 30) - 1614) < 0.01);
});

test('targets are conservative, consistent, and flag low calories', () => {
  const r = computeTargets({ sex: 'male', age: 45, heightIn: 70, weightLb: 220, targetWeightLb: 190, weeklyRate: 1, activity: 'light' });
  const t = r.targets;
  assert.ok(Math.abs(r.tdee - r.dailyDeficit - t.calories) <= 5);
  assert.equal(consistencyWarning(t), null, 'macros should add up');
  assert.ok(t.fiber < t.carbs);
  assert.ok(Math.abs(energyFromMacros(t) - t.calories) <= t.calories * 0.02);

  const low = computeTargets({ sex: 'female', age: 40, heightIn: 62, weightLb: 140, targetWeightLb: 120, weeklyRate: 1.5, activity: 'sedentary' });
  assert.ok(low.warnings.some((x) => x.includes('below 1,200')));
  assert.ok(low.warnings.some((x) => x.includes('1% of body weight')));

  const gain = computeTargets({ sex: 'male', age: 30, heightIn: 70, weightLb: 160, targetWeightLb: 170, weeklyRate: 0.5, activity: 'moderate' });
  assert.equal(gain.dailyDeficit, 0);
});

test('manual macro edits that contradict calories are flagged', () => {
  assert.match(consistencyWarning({ calories: 2000, protein: 200, carbs: 300, fat: 100, fiber: 30 })!, /above/);
  assert.match(consistencyWarning({ calories: 2000, protein: 150, carbs: 20, fat: 60, fiber: 30 })!, /Fiber/);
  assert.equal(consistencyWarning(macrosFor(1800, 150)), null);
});

test('exercise calories are net and never touch the food budget', () => {
  const e = estimateExercise('walking', 60, 200, 'moderate')!;
  // (3.5 - 1) * 90.7 kg * 1 h
  assert.ok(Math.abs(e.calories - 227) <= 1);
  assert.match(e.method, /net of resting/);
  const bySpeed = estimateExercise('running', 30, 180, 'moderate', 3)!; // 6 mph
  assert.match(bySpeed.method, /6\.0 mph/);
  // the budget function has no exercise input at all
  assert.equal(remainingBudget(2000, 1500), 500);
  assert.equal(remainingBudget.length, 2);
  // resting energy is not counted as exercise: MET 1 gives zero
  assert.equal(estimateExercise('yoga', 30, 180, 'light')!.calories, Math.round(1.5 * 81.65 * 0.5));
});

test('weight stats and goal progress', () => {
  const p = profile('p', 'Richard');
  const s = weightStats([w('p', '2026-01-01', 220), w('p', '2026-01-15', 214)], p);
  assert.equal(s.change, -6);
  assert.equal(s.remaining, 24);
  assert.ok(Math.abs(s.percentComplete! - 20) < 1e-9);
  const empty = weightStats([], p);
  assert.equal(empty.latest, null);
  assert.equal(empty.change, null);
});

test('trend needs enough history and ignores gaps instead of filling them', () => {
  assert.equal(linearTrend([w('p', '2026-01-01', 220), w('p', '2026-01-08', 219)]), null);
  assert.equal(linearTrend([w('p', '2026-01-01', 220), w('p', '2026-01-04', 219), w('p', '2026-01-08', 218)]), null); // < 14 days
  // a four-week gap: still uses only the actual points
  const tr = linearTrend([w('p', '2026-01-01', 220), w('p', '2026-01-08', 219), w('p', '2026-02-05', 215)])!;
  assert.equal(tr.n, 3);
  assert.ok(tr.slopePerWeek < 0);
  const date = projectTargetDate(tr, '2026-02-05', 190);
  assert.ok(date && date > '2026-02-05');
});

test('recommendations: insufficient, on track, too slow, at floor', () => {
  const p = profile('p', 'Richard');
  const t = p.targets;
  assert.equal(recommendAdjustment([w('p', '2026-01-01', 220)], p, t, '2026-01-02').status, 'insufficient');
  const onTrack = [0, 7, 14, 21, 28].map((d, i) => w('p', addDays('2026-01-01', d), 220 - i));
  const r1 = recommendAdjustment(onTrack, p, t, '2026-01-30');
  assert.equal(r1.status, 'on_track');
  assert.equal(r1.suggested, undefined);
  const slow = [0, 7, 14, 21, 28].map((d, i) => w('p', addDays('2026-01-01', d), 220 - i * 0.2));
  const r2 = recommendAdjustment(slow, p, t, '2026-01-30');
  assert.equal(r2.status, 'too_slow');
  assert.ok(r2.suggested!.calories < t.calories && r2.suggested!.calories >= t.calories - 200);
  assert.equal(r2.suggested!.protein, t.protein);
  const floor = recommendAdjustment(slow, p, { ...t, calories: 1500 }, '2026-01-30');
  assert.equal(floor.status, 'at_floor');
  // after a target change, wait for new weigh-ins instead of cutting again
  const waiting = recommendAdjustment(slow, p, t, '2026-01-30', '2026-01-20');
  assert.equal(waiting.status, 'insufficient');
  assert.equal(waiting.suggested, undefined);
  const later = [...slow, ...[35, 42, 49].map((d) => w('p', addDays('2026-01-01', d), 219))];
  assert.equal(recommendAdjustment(later, p, t, '2026-02-20', '2026-01-20').status, 'too_slow');
});

test('missing food days are not zero-calorie days', () => {
  const days = summarizeDays('2026-03-01', '2026-03-07', [food('p', '2026-03-01', 2000), food('p', '2026-03-03', 1800)], [], []);
  const agg = aggregate(days, profile('p', 'R').targets);
  assert.equal(agg.days, 7);
  assert.equal(agg.daysLogged, 2);
  assert.equal(agg.avg!.calories, 1900); // not 3800 / 7
  const none = aggregate(summarizeDays('2026-04-01', '2026-04-03', [], [], []), null);
  assert.equal(none.avg, null);
  // complete-only basis
  const c = aggregate(summarizeDays('2026-03-01', '2026-03-07', [food('p', '2026-03-01', 2000), food('p', '2026-03-03', 1800)], [], [{ id: 'p|2026-03-03', profileId: 'p', date: '2026-03-03', complete: true, createdAt: T, updatedAt: T }]), null, 'complete');
  assert.equal(c.avg!.calories, 1800);
  assert.deepEqual(previousPeriod('2026-03-08', '2026-03-14'), ['2026-03-01', '2026-03-07']);
  assert.equal(weightChangeInRange([w('p', '2026-03-02', 200)], '2026-03-01', '2026-03-07'), null);
});

test('profiles stay separate in summaries', () => {
  const ex: ExerciseEntry[] = [{ id: 'e', profileId: 'a', date: '2026-03-01', activity: 'walking', name: 'Walk', durationMin: 30, estimatedCalories: 100, estimationMethod: 'x', createdAt: T, updatedAt: T }];
  const all = [food('r', '2026-03-01', 2000), food('a', '2026-03-01', 1500)];
  const rDays = summarizeDays('2026-03-01', '2026-03-01', all.filter((e) => e.profileId === 'r'), ex.filter((e) => e.profileId === 'r'), []);
  assert.equal(rDays[0].totals.calories, 2000);
  assert.equal(rDays[0].workouts, 0);
});

test('export round-trips and invalid files are rejected', () => {
  const data = emptyDataSet();
  data.profiles.push(profile('r', 'Richard'), profile('a', 'Amanda'));
  data.foodEntries.push(food('r', '2026-03-01', 2000));
  data.weightEntries.push(w('r', '2026-03-01', 219));
  const file = JSON.parse(JSON.stringify(buildExport(data, '1.0.0')));
  const v = validateExport(file);
  assert.ok(v.ok);
  if (v.ok) assert.equal(v.file.data.foodEntries.length, 1);

  assert.equal(validateExport({ format: 'nope' }).ok, false);
  const bad = JSON.parse(JSON.stringify(file));
  bad.data.weightEntries[0].weight = -5;
  assert.equal(validateExport(bad).ok, false);
  const orphan = JSON.parse(JSON.stringify(file));
  orphan.data.weightEntries[0].profileId = 'ghost';
  assert.equal(validateExport(orphan).ok, false);
  const future = { ...file, schemaVersion: 99 };
  assert.equal(validateExport(future).ok, false);
  const badDate = JSON.parse(JSON.stringify(file));
  badDate.data.foodEntries[0].date = '2026-02-31';
  assert.equal(validateExport(badDate).ok, false);
});

test('merge skips duplicates and maps same-name profiles', () => {
  const local = emptyDataSet();
  local.profiles.push(profile('r-phone', 'Richard'));
  local.weightEntries.push(w('r-phone', '2026-03-01', 219));
  const incoming = emptyDataSet();
  incoming.profiles.push(profile('r-pc', 'Richard'), profile('a-pc', 'Amanda'));
  incoming.weightEntries.push({ ...w('r-pc', '2026-03-01', 219), id: 'other-id' }, w('r-pc', '2026-03-08', 218));
  const plan = planImport(buildExport(incoming, '1'), local, 'merge');
  assert.equal(plan.profileMap['r-pc'], 'r-phone');
  assert.equal(plan.stores.profiles.added, 1); // Amanda
  assert.equal(plan.stores.weightEntries.duplicates, 1);
  assert.equal(plan.stores.weightEntries.added, 1);
  assert.ok(plan.writes.weightEntries.every((x) => x.profileId === 'r-phone'));
  // re-importing the same export adds nothing
  const again = planImport(buildExport(local, '1'), local, 'merge');
  assert.equal(again.stores.weightEntries.added, 0);
  assert.equal(again.stores.weightEntries.unchanged, 1);
  // replace writes everything
  assert.equal(planImport(buildExport(incoming, '1'), local, 'replace').writes.profiles.length, 2);
});

test('CSV export escapes values', () => {
  const e = food('r', '2026-03-01', 500);
  e.items[0].name = 'Eggs, "scrambled"';
  const csv = foodCsv([e], () => 'Richard');
  assert.match(csv, /"Eggs, ""scrambled"""/);
});

test('ChatGPT prompt contains only the food description', () => {
  const p = buildFoodPrompt('a burrito');
  assert.match(p, /a burrito/);
  assert.match(p, /```json/);
  assert.doesNotMatch(p, /weight|budget|target/i);
});

test('parses ChatGPT JSON, tables, and lines; rejects junk', () => {
  const json = 'Sure!\n```json\n{"items":[{"name":"Chicken burrito","quantity":1,"unit":"each","calories":"~1050","protein_g":52,"carbs_g":110,"fat_g":40,"fiber_g":14,"uncertain":false},{"name":"Chips","quantity":1,"unit":"bag","calories":540,"protein_g":7,"carbs_g":73,"fat_g":25,"fiber_g":6}],"totals":{"calories":1590,"protein_g":59,"carbs_g":183,"fat_g":65,"fiber_g":20}}\n```';
  const a = parseChatGptResponse(json);
  assert.equal(a.format, 'json');
  assert.equal(a.items.length, 2);
  assert.equal(a.items[0].nutrients.calories, 1050);
  assert.equal(a.items[0].uncertain, true);
  assert.equal(a.totals!.calories, 1590);

  const table = `| Food | Quantity | Calories | Protein (g) | Carbs (g) | Fat (g) | Fiber (g) |\n|---|---|---|---|---|---|---|\n| Pad thai | 1 plate | 900 | 30 | 110 | 35 | 5 |\n| **Total** | | 900 | 30 | 110 | 35 | 5 |`;
  const b = parseChatGptResponse(table);
  assert.equal(b.format, 'table');
  assert.equal(b.items.length, 1);
  assert.equal(b.items[0].nutrients.carbs, 110);
  assert.equal(b.items[0].unit, 'plate');

  const lines = '- Scrambled eggs (2 large): 180 kcal, 12 g protein, 2 g carbs, 14 g fat, 0 g fiber\n- Total: 180 kcal';
  const c = parseChatGptResponse(lines);
  assert.equal(c.items.length, 1);
  assert.equal(c.items[0].nutrients.protein, 12);

  const neg = parseChatGptResponse('{"items":[{"name":"x","calories":-5,"protein_g":1,"carbs_g":1,"fat_g":1}]}');
  assert.ok(neg.items[0].problems.length > 0);
  assert.equal(parseChatGptResponse('hello there').items.length, 0);
});
