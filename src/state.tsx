import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DayStatus, ExerciseEntry, FoodDef, FoodEntry, GoalRecord, LabResult, LoggedItem, MealCategory, Profile, SavedMeal, WeightEntry } from './lib/types';
import * as db from './lib/db';
import { FOODS, FOOD_BY_ID } from './data/foods';
import { buildIndex } from './lib/parser';
import type { FoodIndex } from './lib/parser';
import { toDateKey } from './lib/dates';

export type ScreenName = 'chat' | 'dashboard' | 'food' | 'exercise' | 'weight' | 'progress' | 'settings' | 'saved' | 'goals' | 'profile' | 'data';

export interface ProfileData {
  profile: Profile;
  food: FoodEntry[];
  exercise: ExerciseEntry[];
  weights: WeightEntry[];
  meals: SavedMeal[];
  customFoods: FoodDef[];
  goals: GoalRecord[];
  days: DayStatus[];
  labs: LabResult[];
}

export interface FoodIntent {
  editEntryId?: string;
  date?: string;
  mealId?: string;
  text?: string;
  /** prefilled items, e.g. from a chat meal card or a recommendation */
  items?: LoggedItem[];
  meal?: MealCategory;
  /** open straight into the ChatGPT handoff */
  startPhase?: 'chatgpt';
  /** chat card this entry came from; marked saved when the entry is saved */
  chatMessageId?: string;
  /** where to go after saving or cancelling */
  returnTo?: ScreenName;
  /** a photo picked in the chat for the ChatGPT hand-off (memory only, never stored) */
  photo?: File;
}

interface Ctx {
  ready: boolean;
  error: string | null;
  profiles: Profile[];
  data: ProfileData | null;
  screen: ScreenName;
  go: (s: ScreenName) => void;
  foodIntent: FoodIntent;
  setFoodIntent: (i: FoodIntent) => void;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  switchProfile: (id: string | null) => Promise<void>;
  reload: () => Promise<void>;
  toast: (msg: string) => void;
  toastMsg: string | null;
  online: boolean;
  index: FoodIndex;
  foodById: (id: string | undefined) => FoodDef | undefined;
  allFoods: FoodDef[];
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

const SCREENS: ScreenName[] = ['chat', 'dashboard', 'food', 'exercise', 'weight', 'progress', 'settings', 'saved', 'goals', 'profile', 'data'];

function screenFromHash(): ScreenName {
  const h = window.location.hash.replace(/^#/, '') as ScreenName;
  return SCREENS.includes(h) ? h : 'chat';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [data, setData] = useState<ProfileData | null>(null);
  const [screen, setScreen] = useState<ScreenName>(screenFromHash());
  const [foodIntent, setFoodIntent] = useState<FoodIntent>({});
  const [selectedDate, setSelectedDate] = useState(toDateKey());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const toastTimer = useRef<number | undefined>(undefined);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const loadProfile = useCallback(async (id: string | null) => {
    const all = await db.getAll<Profile>('profiles');
    all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    setProfiles(all);
    const p = all.find((x) => x.id === id) ?? null;
    if (!p) {
      setData(null);
      return;
    }
    const [food, exercise, weights, meals, customFoods, goals, days, labs] = await Promise.all([
      db.getByProfile<FoodEntry>('foodEntries', p.id),
      db.getByProfile<ExerciseEntry>('exerciseEntries', p.id),
      db.getByProfile<WeightEntry>('weightEntries', p.id),
      db.getByProfile<SavedMeal>('savedMeals', p.id),
      db.getByProfile<FoodDef>('customFoods', p.id),
      db.getByProfile<GoalRecord>('goalHistory', p.id),
      db.getByProfile<DayStatus>('dayStatus', p.id),
      db.getByProfile<LabResult>('labResults', p.id),
    ]);
    setData({ profile: p, food, exercise, weights, meals, customFoods, goals, days, labs });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await db.getSetting<string | null>('activeProfile', null);
        setActiveId(saved);
        await loadProfile(saved);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setReady(true);
      }
    })();
  }, [loadProfile]);

  useEffect(() => {
    const onHash = () => setScreen(screenFromHash());
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const go = useCallback((s: ScreenName) => {
    if (s !== screenFromHash()) window.location.hash = s;
    setScreen(s);
    window.scrollTo({ top: 0 });
  }, []);

  const switchProfile = useCallback(
    async (id: string | null) => {
      await db.setSetting('activeProfile', id);
      setActiveId(id);
      setFoodIntent({});
      setSelectedDate(toDateKey());
      await loadProfile(id);
      go('chat');
    },
    [loadProfile, go],
  );

  const reload = useCallback(async () => {
    try {
      await loadProfile(activeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [activeId, loadProfile]);

  const customFoods = data?.customFoods;
  const allFoods = useMemo(() => [...(customFoods ?? []), ...FOODS], [customFoods]);
  const index = useMemo(() => buildIndex(allFoods), [allFoods]);
  const foodById = useCallback((id: string | undefined) => (id ? FOOD_BY_ID[id] ?? customFoods?.find((f) => f.id === id) : undefined), [customFoods]);

  const value: Ctx = {
    ready,
    error,
    profiles,
    data,
    screen,
    go,
    foodIntent,
    setFoodIntent,
    selectedDate,
    setSelectedDate,
    switchProfile,
    reload,
    toast,
    toastMsg,
    online,
    index,
    foodById,
    allFoods,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
