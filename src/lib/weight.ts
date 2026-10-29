import type { Profile, Targets, WeightEntry } from './types';
import { daysBetween, addDays } from './dates';
import { CALORIE_FLOOR, KCAL_PER_LB, macrosFor } from './targets';

export function sortWeights(entries: WeightEntry[]): WeightEntry[] {
  return [...entries].sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));
}

export interface WeightStats {
  start: number;
  latest: number | null;
  latestDate: string | null;
  target: number;
  change: number | null; // latest - start (negative = lost)
  remaining: number | null; // distance still to go, >= 0
  percentComplete: number | null;
  count: number;
}

export function weightStats(entries: WeightEntry[], profile: Pick<Profile, 'startingWeight' | 'targetWeight'>): WeightStats {
  const sorted = sortWeights(entries);
  const last = sorted[sorted.length - 1];
  const start = profile.startingWeight;
  const target = profile.targetWeight;
  if (!last) return { start, latest: null, latestDate: null, target, change: null, remaining: null, percentComplete: null, count: 0 };
  const latest = last.weight;
  const change = latest - start;
  const total = start - target;
  const done = start - latest;
  const remaining = Math.max(0, total >= 0 ? latest - target : target - latest);
  const percentComplete = total === 0 ? null : Math.max(0, Math.min(100, (done / total) * 100));
  return { start, latest, latestDate: last.date, target, change, remaining, percentComplete, count: sorted.length };
}

export interface Trend {
  slopePerWeek: number; // lb per week, negative = losing
  intercept: number; // weight at day 0 (first entry date)
  originDate: string;
  n: number;
  spanDays: number;
  valueAt: (date: string) => number;
}

export const TREND_MIN_POINTS = 3;
export const TREND_MIN_DAYS = 14;

/** Least-squares line through actual weigh-ins. Null when the history is too thin. */
export function linearTrend(entries: WeightEntry[], minPoints = TREND_MIN_POINTS, minDays = TREND_MIN_DAYS): Trend | null {
  const sorted = sortWeights(entries);
  if (sorted.length < minPoints) return null;
  const origin = sorted[0].date;
  const xs = sorted.map((e) => daysBetween(origin, e.date));
  const ys = sorted.map((e) => e.weight);
  const span = xs[xs.length - 1];
  if (span < minDays) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  return {
    slopePerWeek: slope * 7,
    intercept,
    originDate: origin,
    n,
    spanDays: span,
    valueAt: (date: string) => intercept + slope * daysBetween(origin, date),
  };
}

/** Projected date the trend line reaches the target. Null if not heading there. */
export function projectTargetDate(trend: Trend, fromDate: string, target: number): string | null {
  const current = trend.valueAt(fromDate);
  const perDay = trend.slopePerWeek / 7;
  const gap = target - current;
  if (Math.abs(gap) < 0.1) return fromDate;
  if (perDay === 0 || Math.sign(gap) !== Math.sign(perDay)) return null;
  const days = gap / perDay;
  if (days > 3 * 365) return null; // beyond any useful horizon
  return addDays(fromDate, Math.ceil(days));
}

export type RecommendationStatus = 'insufficient' | 'on_track' | 'too_slow' | 'too_fast' | 'at_floor' | 'goal_reached';

export interface Recommendation {
  status: RecommendationStatus;
  observedRate: number | null; // lb/week lost (positive = loss)
  desiredRate: number;
  suggested?: Targets;
  delta?: number;
  rationale: string;
}

export const REC_MIN_POINTS = 4;
export const REC_MIN_DAYS = 21;
const WINDOW_DAYS = 56;

/**
 * Compares the recent weight trend with the planned rate and suggests, never applies,
 * a calorie change. Uses the last 8 weeks of weigh-ins when there are enough of them.
 */
export const REC_POINTS_AFTER_CHANGE = 3;

/**
 * `lastTargetChange`: date calorie targets were last changed. A new suggestion waits for
 * REC_POINTS_AFTER_CHANGE weigh-ins after it, so one change can't trigger a chain of cuts
 * before its effect shows up on the scale.
 */
export function recommendAdjustment(entries: WeightEntry[], profile: Pick<Profile, 'sex' | 'targetWeight' | 'weeklyRate' | 'startingWeight'>, targets: Targets, today: string, lastTargetChange?: string): Recommendation {
  const desiredRate = profile.weeklyRate;
  const sorted = sortWeights(entries);
  if (lastTargetChange) {
    const after = sorted.filter((e) => e.date > lastTargetChange).length;
    if (after < REC_POINTS_AFTER_CHANGE) {
      return {
        status: 'insufficient',
        observedRate: null,
        desiredRate,
        rationale: `Targets changed on ${lastTargetChange}. The next check needs ${REC_POINTS_AFTER_CHANGE} weigh-ins after that date (${after} so far), so the change has time to show up.`,
      };
    }
  }
  const recent = sorted.filter((e) => daysBetween(e.date, today) <= WINDOW_DAYS);
  const pool = recent.length >= REC_MIN_POINTS && daysBetween(recent[0].date, recent[recent.length - 1].date) >= REC_MIN_DAYS ? recent : sorted;
  const trend = linearTrend(pool, REC_MIN_POINTS, REC_MIN_DAYS);
  if (!trend) {
    const need = Math.max(0, REC_MIN_POINTS - sorted.length);
    return {
      status: 'insufficient',
      observedRate: null,
      desiredRate,
      rationale: need > 0
        ? `Needs at least ${REC_MIN_POINTS} weigh-ins over ${REC_MIN_DAYS}+ days before suggesting changes (${need} more to go).`
        : `Needs weigh-ins spread over at least ${REC_MIN_DAYS} days before suggesting changes.`,
    };
  }
  const latest = sorted[sorted.length - 1].weight;
  if (latest <= profile.targetWeight && profile.startingWeight > profile.targetWeight) {
    return { status: 'goal_reached', observedRate: -trend.slopePerWeek, desiredRate, rationale: 'You’ve reached the target weight. Consider moving to maintenance calories.' };
  }
  const observed = -trend.slopePerWeek;
  const basis = `Trend from ${trend.n} weigh-ins over ${Math.round(trend.spanDays / 7)} weeks: ${observed >= 0 ? 'losing' : 'gaining'} ${Math.abs(observed).toFixed(2)} lb/week; planned ${desiredRate} lb/week.`;
  const floor = CALORIE_FLOOR[profile.sex];
  const diff = desiredRate - observed; // positive = slower than planned

  if (diff > 0.3) {
    const raw = Math.round(((diff * KCAL_PER_LB) / 7) / 50) * 50;
    const step = Math.min(200, Math.max(50, raw));
    const next = Math.max(floor, targets.calories - step);
    if (next >= targets.calories) {
      return {
        status: 'at_floor',
        observedRate: observed,
        desiredRate,
        rationale: `${basis} Calories are already at the ${floor.toLocaleString()} kcal floor. Before cutting further, check logging completeness, add activity, or choose a slower rate.`,
      };
    }
    return {
      status: 'too_slow',
      observedRate: observed,
      desiredRate,
      delta: next - targets.calories,
      suggested: macrosFor(next, profile.targetWeight, targets.protein),
      rationale: `${basis} Loss is slower than planned. A ${targets.calories - next} kcal/day reduction is a modest step; re-check after 3–4 more weekly weigh-ins. Unlogged food is a common cause, so confirm logging is complete first.`,
    };
  }
  if (diff < -0.5) {
    const step = Math.min(200, Math.max(50, Math.round(((-diff * KCAL_PER_LB) / 7) / 50) * 50));
    const next = targets.calories + step;
    return {
      status: 'too_fast',
      observedRate: observed,
      desiredRate,
      delta: step,
      suggested: macrosFor(next, profile.targetWeight, targets.protein),
      rationale: `${basis} Loss is faster than planned. Adding ${step} kcal/day can help preserve muscle and make the plan easier to sustain. Early weeks often include water loss.`,
    };
  }
  return { status: 'on_track', observedRate: observed, desiredRate, rationale: `${basis} That’s close to plan, so keep the current targets.` };
}
