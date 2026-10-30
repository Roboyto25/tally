import type { DayStatus, ExerciseEntry, FoodEntry, Nutrients, Targets, WeightEntry } from './types';
import { ZERO } from './types';
import { addNutrients, itemsTotals, scaleNutrients } from './nutrition';
import { addDays, dateRange, daysBetween, endOfMonth, formatDate, startOfMonth, startOfWeek } from './dates';
import { sortWeights } from './weight';

export interface DaySummary {
  date: string;
  /** at least one food entry exists; a day without entries is missing, never zero */
  logged: boolean;
  complete: boolean;
  totals: Nutrients;
  entries: number;
  workouts: number;
  exerciseMinutes: number;
  exerciseCalories: number;
}

export function summarizeDays(from: string, to: string, food: FoodEntry[], exercise: ExerciseEntry[], status: DayStatus[]): DaySummary[] {
  const foodBy = new Map<string, FoodEntry[]>();
  for (const e of food) {
    if (e.date < from || e.date > to) continue;
    const arr = foodBy.get(e.date) ?? [];
    arr.push(e);
    foodBy.set(e.date, arr);
  }
  const exBy = new Map<string, ExerciseEntry[]>();
  for (const e of exercise) {
    if (e.date < from || e.date > to) continue;
    const arr = exBy.get(e.date) ?? [];
    arr.push(e);
    exBy.set(e.date, arr);
  }
  const complete = new Set(status.filter((s) => s.complete).map((s) => s.date));
  return dateRange(from, to).map((date) => {
    const fe = foodBy.get(date) ?? [];
    const ex = exBy.get(date) ?? [];
    return {
      date,
      logged: fe.length > 0,
      complete: fe.length > 0 && complete.has(date),
      totals: fe.reduce((acc, e) => addNutrients(acc, itemsTotals(e.items)), { ...ZERO }),
      entries: fe.length,
      workouts: ex.length,
      exerciseMinutes: ex.reduce((a, e) => a + e.durationMin, 0),
      exerciseCalories: ex.reduce((a, e) => a + e.estimatedCalories, 0),
    };
  });
}

export type DayBasis = 'logged' | 'complete';

export interface Aggregate {
  days: number;
  daysLogged: number;
  daysComplete: number;
  daysCounted: number;
  /** average per counted day; null when no day qualifies */
  avg: Nutrients | null;
  workouts: number;
  exerciseMinutes: number;
  exerciseCalories: number;
  adherence: { calorieDays: number; proteinDays: number; satFatDays: number; fiberDays: number; counted: number } | null;
}

export function aggregate(days: DaySummary[], targets: Targets | null, basis: DayBasis = 'logged'): Aggregate {
  const counted = days.filter((d) => (basis === 'complete' ? d.complete : d.logged));
  const sum = counted.reduce((a, d) => addNutrients(a, d.totals), { ...ZERO });
  const avg = counted.length ? scaleNutrients(sum, 1 / counted.length) : null;
  let adherence: Aggregate['adherence'] = null;
  if (targets && counted.length) {
    adherence = {
      calorieDays: counted.filter((d) => Math.abs(d.totals.calories - targets.calories) <= targets.calories * 0.1).length,
      proteinDays: counted.filter((d) => d.totals.protein >= targets.protein * 0.9).length,
      // within the saturated-fat limit (default 10% of calories when the profile predates the target)
      satFatDays: counted.filter((d) => (d.totals.satFat ?? 0) <= (targets.satFat ?? Math.round((targets.calories * 0.1) / 9))).length,
      fiberDays: counted.filter((d) => d.totals.fiber >= targets.fiber * 0.9).length,
      counted: counted.length,
    };
  }
  return {
    days: days.length,
    daysLogged: days.filter((d) => d.logged).length,
    daysComplete: days.filter((d) => d.complete).length,
    daysCounted: counted.length,
    avg,
    workouts: days.reduce((a, d) => a + d.workouts, 0),
    exerciseMinutes: days.reduce((a, d) => a + d.exerciseMinutes, 0),
    exerciseCalories: days.reduce((a, d) => a + d.exerciseCalories, 0),
    adherence,
  };
}

export interface Bucket {
  key: string;
  label: string;
  from: string;
  to: string;
  days: DaySummary[];
}

export function bucketByWeek(days: DaySummary[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const d of days) {
    const k = startOfWeek(d.date);
    if (!map.has(k)) map.set(k, { key: k, label: formatDate(k, { month: 'short', day: 'numeric' }), from: k, to: addDays(k, 6), days: [] });
    map.get(k)!.days.push(d);
  }
  return [...map.values()];
}

export function bucketByMonth(days: DaySummary[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const d of days) {
    const k = startOfMonth(d.date);
    if (!map.has(k)) map.set(k, { key: k, label: formatDate(k, { month: 'short', year: '2-digit' }), from: k, to: endOfMonth(k), days: [] });
    map.get(k)!.days.push(d);
  }
  return [...map.values()];
}

/** Same-length window immediately before [from, to]. */
export function previousPeriod(from: string, to: string): [string, string] {
  const len = daysBetween(from, to) + 1;
  return [addDays(from, -len), addDays(from, -1)];
}

/** Change between the first and last actual weigh-in inside the range. */
export function weightChangeInRange(weights: WeightEntry[], from: string, to: string): { first: WeightEntry; last: WeightEntry; change: number } | null {
  const inRange = sortWeights(weights).filter((w) => w.date >= from && w.date <= to);
  if (inRange.length < 2) return null;
  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  return { first, last, change: last.weight - first.weight };
}
