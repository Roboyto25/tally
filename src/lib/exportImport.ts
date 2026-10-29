import type { DayStatus, ExerciseEntry, FoodDef, FoodEntry, GoalRecord, Profile, SavedMeal, SettingRecord, WeightEntry } from './types';
import { isValidDateKey, isValidTimeKey } from './dates';
import { isValidNutrients, itemsTotals } from './nutrition';

export const EXPORT_FORMAT = 'tally-fitness-export';
export const SCHEMA_VERSION = 1;

export interface DataSet {
  profiles: Profile[];
  foodEntries: FoodEntry[];
  customFoods: FoodDef[];
  savedMeals: SavedMeal[];
  exerciseEntries: ExerciseEntry[];
  weightEntries: WeightEntry[];
  goalHistory: GoalRecord[];
  dayStatus: DayStatus[];
  settings: SettingRecord[];
}

export type StoreName = keyof DataSet;
export const STORE_NAMES: StoreName[] = ['profiles', 'foodEntries', 'customFoods', 'savedMeals', 'exerciseEntries', 'weightEntries', 'goalHistory', 'dayStatus', 'settings'];
export const STORE_LABELS: Record<StoreName, string> = {
  profiles: 'Profiles',
  foodEntries: 'Food entries',
  customFoods: 'Custom foods',
  savedMeals: 'Saved meals',
  exerciseEntries: 'Workouts',
  weightEntries: 'Weigh-ins',
  goalHistory: 'Goal changes',
  dayStatus: 'Day status marks',
  settings: 'Settings',
};

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  data: DataSet;
}

export function emptyDataSet(): DataSet {
  return { profiles: [], foodEntries: [], customFoods: [], savedMeals: [], exerciseEntries: [], weightEntries: [], goalHistory: [], dayStatus: [], settings: [] };
}

export function buildExport(data: DataSet, appVersion: string): ExportFile {
  return { format: EXPORT_FORMAT, schemaVersion: SCHEMA_VERSION, appVersion, exportedAt: new Date().toISOString(), data };
}

// ---------- validation ----------

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown, min = -Infinity, max = Infinity): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isIso = (v: unknown) => isStr(v) && !Number.isNaN(Date.parse(v));

type Validator = (r: Record<string, unknown>) => string | null;

const VALIDATORS: Record<StoreName, Validator> = {
  profiles: (r) => {
    if (!isStr(r.id) || !isStr(r.name)) return 'missing id or name';
    if (!isNum(r.age, 1, 120) || !isNum(r.heightIn, 36, 96)) return 'invalid age or height';
    if (!isNum(r.startingWeight, 50, 1000) || !isNum(r.targetWeight, 50, 1000) || !isNum(r.currentWeight, 50, 1000)) return 'invalid weight';
    if (r.sex !== 'male' && r.sex !== 'female') return 'invalid sex';
    if (!isValidNutrients(r.targets)) return 'invalid targets';
    if (!isIso(r.createdAt) || !isIso(r.updatedAt)) return 'invalid timestamps';
    return null;
  },
  foodEntries: (r) => {
    if (!isStr(r.id) || !isStr(r.profileId)) return 'missing id or profile';
    if (!isValidDateKey(r.date) || !isValidTimeKey(r.time)) return 'invalid date or time';
    if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(r.meal as string)) return 'invalid meal';
    if (!Array.isArray(r.items) || !r.items.length) return 'no food items';
    for (const it of r.items as Record<string, unknown>[]) {
      if (!it || !isStr(it.name) || !isNum(it.quantity, 0) || typeof it.unit !== 'string' || !isValidNutrients(it.nutrients)) return 'invalid food item';
    }
    if (!isIso(r.createdAt) || !isIso(r.updatedAt)) return 'invalid timestamps';
    return null;
  },
  customFoods: (r) => {
    if (!isStr(r.id) || !isStr(r.name) || !isStr(r.profileId)) return 'missing id, name, or profile';
    if (!isValidNutrients(r.per) || !isNum(r.basisAmount, 0.0001)) return 'invalid nutrition';
    if (!r.portions || typeof r.portions !== 'object') return 'invalid portions';
    return null;
  },
  savedMeals: (r) => {
    if (!isStr(r.id) || !isStr(r.profileId) || !isStr(r.name)) return 'missing id, profile, or name';
    if (!Array.isArray(r.items) || !r.items.length) return 'no items';
    for (const it of r.items as Record<string, unknown>[]) if (!it || !isStr(it.name) || !isValidNutrients(it.nutrients)) return 'invalid item';
    return null;
  },
  exerciseEntries: (r) => {
    if (!isStr(r.id) || !isStr(r.profileId) || !isStr(r.name)) return 'missing id, profile, or name';
    if (!isValidDateKey(r.date)) return 'invalid date';
    if (!isNum(r.durationMin, 0.1, 1440) || !isNum(r.estimatedCalories, 0, 20000)) return 'invalid duration or calories';
    if (r.distanceMi !== undefined && r.distanceMi !== null && !isNum(r.distanceMi, 0, 500)) return 'invalid distance';
    return null;
  },
  weightEntries: (r) => {
    if (!isStr(r.id) || !isStr(r.profileId)) return 'missing id or profile';
    if (!isValidDateKey(r.date)) return 'invalid date';
    if (!isNum(r.weight, 50, 1000)) return 'invalid weight';
    return null;
  },
  goalHistory: (r) => {
    if (!isStr(r.id) || !isStr(r.profileId) || !isValidDateKey(r.effectiveDate)) return 'missing id, profile, or date';
    if (!isValidNutrients(r.targets)) return 'invalid targets';
    return null;
  },
  dayStatus: (r) => {
    if (!isStr(r.id) || !isStr(r.profileId) || !isValidDateKey(r.date) || typeof r.complete !== 'boolean') return 'invalid day status';
    return null;
  },
  settings: (r) => (isStr(r.key) ? null : 'missing key'),
};

export type ValidationResult = { ok: true; file: ExportFile; warnings: string[] } | { ok: false; errors: string[] };

export function validateExport(json: unknown): ValidationResult {
  const errors: string[] = [];
  if (!json || typeof json !== 'object') return { ok: false, errors: ['File is not a JSON object.'] };
  const f = json as Record<string, unknown>;
  if (f.format !== EXPORT_FORMAT) return { ok: false, errors: ['This isn’t a Tally export file.'] };
  if (!isNum(f.schemaVersion, 1)) return { ok: false, errors: ['Missing schema version.'] };
  if ((f.schemaVersion as number) > SCHEMA_VERSION) return { ok: false, errors: [`File uses schema version ${f.schemaVersion}; this app reads up to version ${SCHEMA_VERSION}. Update the app first.`] };
  if (!f.data || typeof f.data !== 'object') return { ok: false, errors: ['Missing data section.'] };
  const data = f.data as Record<string, unknown>;
  const out = emptyDataSet();
  for (const store of STORE_NAMES) {
    const arr = data[store] ?? [];
    if (!Array.isArray(arr)) {
      errors.push(`${STORE_LABELS[store]}: expected a list.`);
      continue;
    }
    const seen = new Set<string>();
    arr.forEach((rec, i) => {
      const problem = rec && typeof rec === 'object' ? VALIDATORS[store](rec as Record<string, unknown>) : 'not an object';
      const key = store === 'settings' ? (rec as SettingRecord)?.key : (rec as { id?: string })?.id;
      if (problem) errors.push(`${STORE_LABELS[store]} #${i + 1}: ${problem}.`);
      else if (seen.has(key as string)) errors.push(`${STORE_LABELS[store]} #${i + 1}: duplicate identifier.`);
      else {
        seen.add(key as string);
        (out[store] as unknown[]).push(rec);
      }
    });
  }
  // every profile-owned record must point at a profile in the file
  const profileIds = new Set(out.profiles.map((p) => p.id));
  for (const store of STORE_NAMES) {
    if (store === 'profiles' || store === 'settings') continue;
    for (const r of out[store] as { profileId?: string }[]) {
      if (r.profileId && !profileIds.has(r.profileId)) {
        errors.push(`${STORE_LABELS[store]}: a record belongs to a profile that isn’t in the file.`);
        break;
      }
    }
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 20).concat(errors.length > 20 ? [`…and ${errors.length - 20} more problems.`] : []) };
  return { ok: true, file: { ...(f as unknown as ExportFile), data: out }, warnings: [] };
}

// ---------- merge planning ----------

export interface StorePlan {
  incoming: number;
  added: number;
  updated: number;
  unchanged: number;
  duplicates: number;
}

export interface ImportPlan {
  mode: 'merge' | 'replace';
  stores: Record<StoreName, StorePlan>;
  /** incoming profile id -> local profile id, when the same person exists locally under another id */
  profileMap: Record<string, string>;
  /** records to write, already remapped */
  writes: DataSet;
}

function stamp(r: unknown): string {
  return (r as { updatedAt?: string }).updatedAt ?? '';
}

function signature(store: StoreName, r: Record<string, unknown>): string | null {
  switch (store) {
    case 'weightEntries':
      return `${r.profileId}|${r.date}|${r.weight}`;
    case 'exerciseEntries':
      return `${r.profileId}|${r.date}|${r.name}|${r.durationMin}`;
    case 'foodEntries': {
      const items = (r.items as { name: string; quantity: number; unit: string }[]).map((i) => `${i.name}:${i.quantity}:${i.unit}`).sort().join(',');
      return `${r.profileId}|${r.date}|${r.time}|${items}`;
    }
    case 'savedMeals':
    case 'customFoods':
      return `${r.profileId}|${String(r.name).toLowerCase()}`;
    case 'dayStatus':
      return `${r.profileId}|${r.date}`;
    default:
      return null;
  }
}

function remap<T>(rec: T, map: Record<string, string>): T {
  const r = rec as unknown as Record<string, unknown>;
  if (typeof r.profileId === 'string' && map[r.profileId]) {
    const next: Record<string, unknown> = { ...r, profileId: map[r.profileId] };
    if (typeof next.id === 'string' && (next.id as string).includes('|')) next.id = `${map[r.profileId]}|${next.date}`;
    return next as unknown as T;
  }
  return rec;
}

export function planImport(file: ExportFile, local: DataSet, mode: 'merge' | 'replace'): ImportPlan {
  const stores = {} as Record<StoreName, StorePlan>;
  const writes = emptyDataSet();
  const profileMap: Record<string, string> = {};

  if (mode === 'replace') {
    for (const s of STORE_NAMES) {
      const n = (file.data[s] as unknown[]).length;
      stores[s] = { incoming: n, added: n, updated: 0, unchanged: 0, duplicates: 0 };
      (writes[s] as unknown[]) = [...(file.data[s] as unknown[])];
    }
    return { mode, stores, profileMap, writes };
  }

  // Same person set up separately on two devices: match by name so records land in one profile.
  const localByName = new Map(local.profiles.map((p) => [p.name.trim().toLowerCase(), p]));
  const localIds = new Set(local.profiles.map((p) => p.id));
  for (const p of file.data.profiles) {
    if (localIds.has(p.id)) continue;
    const match = localByName.get(p.name.trim().toLowerCase());
    if (match) profileMap[p.id] = match.id;
  }

  for (const s of STORE_NAMES) {
    const plan: StorePlan = { incoming: (file.data[s] as unknown[]).length, added: 0, updated: 0, unchanged: 0, duplicates: 0 };
    if (s === 'settings') {
      // local settings win in a merge; nothing is written
      plan.unchanged = plan.incoming;
      stores[s] = plan;
      continue;
    }
    const localArr = local[s] as unknown as Record<string, unknown>[];
    const byId = new Map(localArr.map((r) => [r.id as string, r]));
    const sigs = new Set(localArr.map((r) => signature(s, r)).filter(Boolean) as string[]);
    for (const raw of file.data[s] as unknown as Record<string, unknown>[]) {
      if (s === 'profiles' && profileMap[raw.id as string]) {
        plan.duplicates++;
        continue;
      }
      const rec = remap(raw, profileMap);
      const existing = byId.get(rec.id as string);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(rec)) plan.unchanged++;
        else if (stamp(rec) > stamp(existing)) {
          plan.updated++;
          (writes[s] as unknown[]).push(rec);
        } else plan.unchanged++;
        continue;
      }
      const sig = signature(s, rec);
      if (sig && sigs.has(sig)) {
        plan.duplicates++;
        continue;
      }
      if (sig) sigs.add(sig);
      plan.added++;
      (writes[s] as unknown[]).push(rec);
    }
    stores[s] = plan;
  }
  return { mode, stores, profileMap, writes };
}

// ---------- CSV ----------

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function foodCsv(entries: FoodEntry[], profileName: (id: string) => string): string {
  const rows: unknown[][] = [];
  for (const e of [...entries].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))) {
    for (const i of e.items) {
      rows.push([profileName(e.profileId), e.date, e.time, e.meal, i.name, i.quantity, i.unit, r1(i.nutrients.calories), r1(i.nutrients.protein), r1(i.nutrients.carbs), r1(i.nutrients.fat), r1(i.nutrients.fiber), i.source, i.estimated ? 'yes' : 'no']);
    }
  }
  return toCsv(['profile', 'date', 'time', 'meal', 'food', 'quantity', 'unit', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'source', 'estimated'], rows);
}

export function weightCsv(entries: WeightEntry[], profileName: (id: string) => string): string {
  return toCsv(['profile', 'date', 'weight_lb', 'notes'], [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((w) => [profileName(w.profileId), w.date, w.weight, w.notes ?? '']));
}

export function exerciseCsv(entries: ExerciseEntry[], profileName: (id: string) => string): string {
  return toCsv(
    ['profile', 'date', 'activity', 'duration_min', 'distance_mi', 'intensity', 'net_calories_est', 'method', 'notes'],
    [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((x) => [profileName(x.profileId), x.date, x.name, x.durationMin, x.distanceMi ?? '', x.intensity ?? '', x.estimatedCalories, x.estimationMethod, x.notes ?? '']),
  );
}

/** Recompute derived totals on import so stored totals always match items. */
export function normalizeFoodEntry(e: FoodEntry): FoodEntry {
  return { ...e, totals: itemsTotals(e.items) };
}
