export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack';
/** database = bundled dataset, custom = user-saved food, user = typed by hand, ai = ChatGPT estimate */
export type SourceType = 'database' | 'custom' | 'user' | 'ai';
export type Intensity = 'light' | 'moderate' | 'vigorous';

export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number; // total carbohydrate, fiber included
  fat: number;
  fiber: number;
}

export interface Targets extends Nutrients {}

/** Local hours (decimal). Times outside breakfast/lunch/dinner windows default to snack. */
export interface MealBoundaries {
  breakfastStart: number;
  breakfastEnd: number;
  lunchEnd: number;
  dinnerStart: number;
  dinnerEnd: number;
}

export interface Profile {
  id: string;
  name: string;
  age: number;
  sex: Sex;
  heightIn: number;
  startingWeight: number;
  currentWeight: number;
  targetWeight: number;
  weeklyRate: number; // lb per week, positive = loss
  activityLevel: ActivityLevel;
  targets: Targets;
  mealBoundaries: MealBoundaries;
  createdAt: string;
  updatedAt: string;
}

/** Food definition. `per` holds nutrients for `basisAmount` of `basisUnit`. */
export interface FoodDef {
  id: string;
  name: string;
  category: string;
  synonyms: string[];
  basisAmount: number; // e.g. 100
  basisUnit: 'g' | 'serving';
  per: Nutrients;
  /** amount of basisUnit contained in one of each unit, e.g. { large: 50, cup: 158 } */
  portions: Record<string, number>;
  defaultUnit: string;
  liquid?: boolean;
  preparation?: string;
  source: string;
  quality?: string;
  profileId?: string; // set for custom foods
  createdAt?: string;
  updatedAt?: string;
}

export interface LoggedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  foodId?: string;
  nutrients: Nutrients;
  source: SourceType;
  estimated: boolean;
  manualOverride?: boolean;
  /** reference serving for proportional rescaling of AI / user items */
  ref?: { quantity: number; unit: string; nutrients: Nutrients };
  note?: string;
}

export interface FoodEntry {
  id: string;
  profileId: string;
  date: string; // YYYY-MM-DD local
  time: string; // HH:MM local
  meal: MealCategory;
  items: LoggedItem[];
  totals: Nutrients;
  sourceType: SourceType | 'mixed';
  estimated: boolean;
  notes?: string;
  importHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedMeal {
  id: string;
  profileId: string;
  name: string;
  items: LoggedItem[];
  totals: Nutrients;
  notes?: string;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseEntry {
  id: string;
  profileId: string;
  date: string;
  activity: string; // key from activity table or 'other'
  name: string;
  durationMin: number;
  distanceMi?: number;
  intensity?: Intensity;
  estimatedCalories: number; // net, above resting
  estimationMethod: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeightEntry {
  id: string;
  profileId: string;
  date: string;
  weight: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoalRecord {
  id: string;
  profileId: string;
  effectiveDate: string;
  targets: Targets;
  targetWeight: number;
  weeklyRate: number;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface DayStatus {
  id: string; // `${profileId}|${date}`
  profileId: string;
  date: string;
  complete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export const ZERO: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
export const MEALS: MealCategory[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export const MEAL_LABEL: Record<MealCategory, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};
