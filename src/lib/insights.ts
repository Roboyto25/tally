import type { DayStatus, ExerciseEntry, FoodEntry, LabMarker, LabResult, WeightEntry } from './types';
import { LAB_LABEL } from './types';
import type { FullTargets } from './targets';
import { aggregate, summarizeDays } from './progress';
import { addDays, daysBetween, formatDate } from './dates';
import { sortWeights } from './weight';

/**
 * Plain-language summaries computed only from stored records. Each one reports when
 * the data is too thin to support a conclusion instead of inventing one.
 */

export interface Report {
  enough: boolean;
  lines: string[];
}

const MIN_DAYS = 3;

export interface SatSource {
  name: string;
  grams: number;
}

/** Foods that contributed the most saturated fat in a date range. */
export function topSatFatSources(food: FoodEntry[], from: string, to: string, n = 3): SatSource[] {
  const by = new Map<string, number>();
  for (const e of food) {
    if (e.date < from || e.date > to) continue;
    for (const i of e.items) {
      const g = i.nutrients.satFat;
      if (typeof g !== 'number' || g <= 0) continue;
      const k = i.name.split(',')[0];
      by.set(k, (by.get(k) ?? 0) + g);
    }
  }
  return [...by.entries()].map(([name, grams]) => ({ name, grams })).sort((a, b) => b.grams - a.grams).slice(0, n);
}

/** Practical swaps for common saturated-fat sources. Keyed by the first word(s) of the food name. */
const SWAPS: [RegExp, string][] = [
  [/butter|ghee/i, 'cook with olive or canola oil instead of butter'],
  [/cheddar|cheese|american|swiss|parmesan|feta|mozzarella/i, 'use less cheese, or a smaller amount of a sharp one for flavor'],
  [/bacon|sausage|salami|pepperoni|hot dog/i, 'swap processed meats for chicken, turkey breast, fish, or egg whites'],
  [/ribeye|ground beef|sirloin/i, 'choose fish, poultry, or 93% lean beef more often'],
  [/cream|half and half|creamer|ice cream/i, 'switch to skim milk or a lower-fat creamer'],
  [/coconut/i, 'replace coconut oil with olive or canola oil'],
  [/croissant|cookie|pastry|pizza/i, 'save baked goods and pizza for occasional meals'],
  [/chocolate/i, 'keep chocolate to a small square'],
];

export function swapFor(name: string): string | null {
  for (const [re, tip] of SWAPS) if (re.test(name)) return tip;
  return null;
}

export function weekReport(food: FoodEntry[], exercise: ExerciseEntry[], days: DayStatus[], t: FullTargets, today: string): Report {
  const from = addDays(today, -6);
  const sum = summarizeDays(from, today, food, exercise, days);
  const agg = aggregate(sum, t, 'logged');
  const logged = sum.filter((d) => d.logged);
  if (logged.length < MIN_DAYS) {
    return { enough: false, lines: [`Only ${logged.length} of the last 7 days have food logged. I need at least ${MIN_DAYS} before saying anything useful about the week.`] };
  }
  const a = agg.avg!;
  const lines: string[] = [];
  lines.push(`Last 7 days (${logged.length} days logged): about ${Math.round(a.calories).toLocaleString()} kcal a day against your ${t.calories.toLocaleString()} target.`);
  const satDays = logged.filter((d) => (d.totals.satFat ?? 0) > t.satFat).length;
  lines.push(`Saturated fat averaged ${Math.round(a.satFat ?? 0)} g (limit ${t.satFat} g); over the limit on ${satDays} of ${logged.length} days.`);
  lines.push(`Fiber averaged ${Math.round(a.fiber)} g (target ${t.fiber} g). Protein averaged ${Math.round(a.protein)} g (target ${t.protein} g).`);
  if (agg.workouts) lines.push(`${agg.workouts} workout${agg.workouts === 1 ? '' : 's'}, ${Math.round(agg.exerciseMinutes)} minutes.`);

  // what to improve: the biggest gap, in priority order
  const improve: string[] = [];
  if (a.calories > t.calories * 1.05) improve.push(`Calories ran about ${Math.round(a.calories - t.calories)} kcal a day over target; that’s the first thing to tighten for weight loss.`);
  if (satDays >= Math.ceil(logged.length / 2)) {
    const src = topSatFatSources(food, from, today);
    const top = src.map((s) => `${s.name} (${Math.round(s.grams)} g)`).join(', ');
    const tip = src.map((s) => swapFor(s.name)).find(Boolean);
    improve.push(`Saturated fat was over your limit most days. Biggest sources: ${top}.${tip ? ` Easiest change: ${tip}.` : ''}`);
  }
  if (a.fiber < t.fiber * 0.8) improve.push(`Fiber is short by about ${Math.round(t.fiber - a.fiber)} g a day. Oats at breakfast and a cup of beans or lentils most days would close most of that gap, and both add soluble fiber.`);
  if (a.protein < t.protein * 0.85) improve.push(`Protein is about ${Math.round(t.protein - a.protein)} g a day under target; adding fish, poultry, Greek yogurt, or beans to two meals would cover it.`);
  if (logged.length < 6) improve.push(`${7 - logged.length} day${7 - logged.length === 1 ? ' was' : 's were'} not logged, so these averages may not reflect the whole week.`);
  lines.push(improve.length ? `To improve: ${improve[0]}` : 'You were close to every target this week. Keep doing what you’re doing.');
  for (const x of improve.slice(1, 3)) lines.push(`Also: ${x}`);
  return { enough: true, lines };
}

export function satFatCheck(food: FoodEntry[], exercise: ExerciseEntry[], days: DayStatus[], t: FullTargets, today: string): Report {
  const from = addDays(today, -13);
  const sum = summarizeDays(from, today, food, exercise, days).filter((d) => d.logged);
  if (sum.length < 5) return { enough: false, lines: [`Only ${sum.length} days logged in the last two weeks. I need at least 5 to say whether you’re consistently over.`] };
  const over = sum.filter((d) => (d.totals.satFat ?? 0) > t.satFat);
  const avg = sum.reduce((s, d) => s + (d.totals.satFat ?? 0), 0) / sum.length;
  const lines = [`Over the last two weeks you went over your ${t.satFat} g saturated-fat limit on ${over.length} of ${sum.length} logged days (average ${avg.toFixed(0)} g).`];
  if (over.length / sum.length >= 0.5) {
    const src = topSatFatSources(food, from, today);
    lines.push(`So yes, that’s consistent. Top sources: ${src.map((s) => `${s.name} ${Math.round(s.grams)} g`).join(', ')}.`);
    const tips = [...new Set(src.map((s) => swapFor(s.name)).filter(Boolean))].slice(0, 2);
    if (tips.length) lines.push(`Try: ${tips.join('; ')}.`);
  } else lines.push('That’s not a consistent pattern. Occasional days over are fine if the average stays under the limit.');
  return { enough: true, lines };
}

export function monthWeight(weights: WeightEntry[], today: string): Report {
  const all = sortWeights(weights);
  const from = addDays(today, -30);
  const inMonth = all.filter((w) => w.date >= from && w.date <= today);
  if (inMonth.length < 2) {
    return { enough: false, lines: [`There ${inMonth.length === 1 ? 'is only one weigh-in' : 'are no weigh-ins'} in the last 30 days, so I can’t measure a change. A weekly weigh-in is enough.`] };
  }
  const first = inMonth[0];
  const last = inMonth[inMonth.length - 1];
  const change = last.weight - first.weight;
  const weeks = Math.max(1, daysBetween(first.date, last.date) / 7);
  const lines = [`From ${formatDate(first.date, { month: 'short', day: 'numeric' })} to ${formatDate(last.date, { month: 'short', day: 'numeric' })}: ${change <= 0 ? 'down' : 'up'} ${Math.abs(change).toFixed(1)} lb (${first.weight} → ${last.weight} lb), about ${Math.abs(change / weeks).toFixed(1)} lb a week, over ${inMonth.length} weigh-ins.`];
  if (inMonth.length < 4) lines.push('That’s only a few measurements, so treat the rate as rough. Day-to-day water shifts can move the scale 2–3 lb.');
  return { enough: true, lines };
}

export function labSummary(labs: LabResult[], marker: LabMarker = 'ldl'): Report {
  const pts = labs.filter((l) => typeof l[marker] === 'number').sort((a, b) => a.date.localeCompare(b.date));
  if (!pts.length) return { enough: false, lines: [`No ${LAB_LABEL[marker]} results entered yet. You can add blood test results under Progress → Blood tests. They’re optional.`] };
  const last = pts[pts.length - 1];
  const lines = [`Latest ${LAB_LABEL[marker]}: ${last[marker]} ${last.unit} on ${formatDate(last.date, { month: 'short', day: 'numeric', year: 'numeric' })}.`];
  if (pts.length >= 2) {
    const first = pts[0];
    if (first.unit === last.unit) {
      const d = last[marker]! - first[marker]!;
      lines.push(`Since ${formatDate(first.date, { month: 'short', year: 'numeric' })} (${first[marker]} ${first.unit}), that’s ${d === 0 ? 'unchanged' : `${d < 0 ? 'down' : 'up'} ${Math.abs(Math.round(d * 10) / 10)} ${last.unit}`} across ${pts.length} tests.`);
    }
  } else lines.push('With one result there’s no trend yet.');
  lines.push('These are measured lab values you entered. Tally doesn’t estimate or predict blood cholesterol from food logs; talk with your clinician about what the numbers mean for you.');
  return { enough: true, lines };
}
