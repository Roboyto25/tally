import type { Intensity } from './types';

/**
 * MET values from the Compendium of Physical Activities (Ainsworth et al.; 2024 update).
 * Estimates are NET calories: energy above resting, (MET − 1) × kg × hours.
 * Resting energy is already in the calorie target's maintenance estimate, so counting
 * gross calories here would double-count it.
 */
export interface ActivityDef {
  key: string;
  label: string;
  met: Record<Intensity, number>;
  usesDistance?: boolean;
  /** MET by speed (mph) thresholds, used when distance and duration are both known */
  speedTable?: [maxMph: number, met: number][];
}

export const ACTIVITIES: ActivityDef[] = [
  { key: 'walking', label: 'Walking', met: { light: 2.8, moderate: 3.5, vigorous: 4.3 }, usesDistance: true, speedTable: [[2, 2.0], [2.5, 2.8], [3, 3.0], [3.5, 3.5], [4, 4.3], [4.5, 5.0], [99, 7.0]] },
  { key: 'running', label: 'Running', met: { light: 8.0, moderate: 9.8, vigorous: 11.5 }, usesDistance: true, speedTable: [[5, 8.3], [6, 9.8], [7, 11.0], [8, 11.8], [9, 12.8], [10, 14.5], [99, 16.0]] },
  { key: 'cycling', label: 'Cycling', met: { light: 4.0, moderate: 6.8, vigorous: 10.0 }, usesDistance: true, speedTable: [[10, 4.0], [12, 6.8], [14, 8.0], [16, 10.0], [20, 12.0], [99, 15.8]] },
  { key: 'swimming', label: 'Swimming', met: { light: 5.8, moderate: 7.0, vigorous: 9.8 }, usesDistance: true },
  { key: 'strength', label: 'Strength training', met: { light: 3.5, moderate: 5.0, vigorous: 6.0 } },
  { key: 'hiking', label: 'Hiking', met: { light: 5.3, moderate: 6.0, vigorous: 7.8 }, usesDistance: true },
  { key: 'rowing', label: 'Rowing', met: { light: 4.8, moderate: 7.0, vigorous: 8.5 }, usesDistance: true },
  { key: 'elliptical', label: 'Elliptical', met: { light: 4.6, moderate: 5.0, vigorous: 6.8 } },
  { key: 'sports', label: 'Sports', met: { light: 4.0, moderate: 6.0, vigorous: 8.0 } },
  { key: 'yoga', label: 'Yoga or stretching', met: { light: 2.5, moderate: 3.0, vigorous: 4.0 } },
  { key: 'other', label: 'Other activity', met: { light: 3.0, moderate: 4.5, vigorous: 6.0 } },
];

export const ACTIVITY_BY_KEY: Record<string, ActivityDef> = Object.fromEntries(ACTIVITIES.map((a) => [a.key, a]));

export interface ExerciseEstimate {
  calories: number;
  met: number;
  method: string;
}

export function estimateExercise(activityKey: string, durationMin: number, weightLb: number, intensity: Intensity = 'moderate', distanceMi?: number): ExerciseEstimate | null {
  const def = ACTIVITY_BY_KEY[activityKey] ?? ACTIVITY_BY_KEY.other;
  if (!(durationMin > 0) || !(weightLb > 0)) return null;
  let met = def.met[intensity];
  let method = `MET ${met} (${def.label.toLowerCase()}, ${intensity})`;
  if (def.speedTable && distanceMi && distanceMi > 0) {
    const mph = distanceMi / (durationMin / 60);
    const row = def.speedTable.find(([max]) => mph < max);
    if (row) {
      met = row[1];
      method = `MET ${met} from ${mph.toFixed(1)} mph average`;
    }
  }
  const kg = weightLb * 0.45359237;
  const calories = Math.max(0, met - 1) * kg * (durationMin / 60);
  return { calories: Math.round(calories), met, method: `${method}; net of resting energy` };
}
