import type { ChatMessage, FoodDef, LoggedItem, MealCategory, Nutrients, Profile } from './lib/types';
import type { ProfileData } from './state';
import { dailyTotals } from './lib/nutrition';
import { resolveTargets } from './lib/targets';
import type { FullTargets } from './lib/targets';
import { nextMeal, recommend } from './lib/recommend';
import type { Constraints, RecResult, Suggestion } from './lib/recommend';
import type { PendingLine } from './lib/chat';
import { FOOD_BY_ID } from './data/foods';
import { uid } from './lib/id';
import { nowIso, toDateKey } from './lib/dates';
import * as db from './lib/db';

// ---------- chat cards (stored on ChatMessage.card) ----------

export interface MealCard {
  type: 'meal';
  status: 'pending' | 'saved' | 'discarded';
  meal: MealCategory;
  date: string;
  time: string;
  lines: PendingLine[];
  sourceText: string;
  restaurant?: boolean;
  dish?: boolean;
  entryId?: string;
}

export interface RecsCard {
  type: 'recs';
  meal: MealCategory;
  budget: number;
  suggestions: Suggestion[];
  /** the user's request, for the ChatGPT planning hand-off */
  request?: string;
  remaining: { calories: number; protein: number; satFat: number; fiber: number };
}

export interface WeightCard {
  type: 'weight';
  status: 'pending' | 'saved' | 'discarded';
  weight: number;
  date: string;
}

export interface ExerciseCard {
  type: 'exercise';
  status: 'pending' | 'saved' | 'discarded';
  activity: string;
  name: string;
  date: string;
  durationMin: number;
  distanceMi?: number;
  intensity: 'light' | 'moderate' | 'vigorous';
}

export interface LabsCard {
  type: 'labs';
}

export interface FoodInfoCard {
  type: 'foodinfo';
  lines: PendingLine[];
  text: string;
}

export type Card = MealCard | RecsCard | WeightCard | ExerciseCard | LabsCard | FoodInfoCard;

export function cardOf(m: ChatMessage): Card | undefined {
  return m.card as Card | undefined;
}

// ---------- context ----------

export function foodsMap(custom: FoodDef[]): Record<string, FoodDef> {
  const out: Record<string, FoodDef> = { ...FOOD_BY_ID };
  for (const f of custom) out[f.id] = f;
  return out;
}

export function targetsOf(p: Profile): FullTargets {
  return resolveTargets(p.targets);
}

export interface DayContext {
  targets: FullTargets;
  totals: Nutrients;
  entries: ProfileData['food'];
  items: LoggedItem[];
}

export function dayContext(d: ProfileData, date = toDateKey()): DayContext {
  const entries = d.food.filter((e) => e.date === date);
  return { targets: targetsOf(d.profile), totals: dailyTotals(d.food, date), entries, items: entries.flatMap((e) => e.items) };
}

export function recentFoodIds(d: ProfileData, n = 25): string[] {
  const ids: string[] = [];
  for (const e of [...d.food].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    for (const i of e.items) if (i.foodId && !ids.includes(i.foodId)) ids.push(i.foodId);
    if (ids.length >= n) break;
  }
  return ids;
}

export function recsFor(d: ProfileData, opts: { meal?: MealCategory; constraints?: Constraints; date?: string; limit?: number; extraTotals?: Nutrients } = {}): RecResult {
  const ctx = dayContext(d, opts.date);
  const eaten = new Set(ctx.entries.map((e) => e.meal));
  const meal = opts.meal ?? nextMeal(new Date(), d.profile.mealBoundaries, eaten);
  return recommend({
    targets: ctx.targets,
    totals: ctx.totals,
    meal,
    constraints: opts.constraints,
    foods: foodsMap(d.customFoods),
    savedMeals: d.meals,
    recentFoodIds: recentFoodIds(d),
    todayFoodIds: ctx.items.map((i) => i.foodId).filter(Boolean) as string[],
    limit: opts.limit ?? 3,
  });
}

export function recsCardFrom(r: RecResult, request?: string): RecsCard {
  return { type: 'recs', meal: r.meal, budget: r.budget, suggestions: r.suggestions, request, remaining: { calories: r.remaining.calories, protein: r.remaining.protein, satFat: r.remaining.satFat, fiber: r.remaining.fiber } };
}

// ---------- persistence ----------

let lastStamp = 0;

/** Strictly increasing timestamps, so a question and its reply never load back out of order. */
function messageStamp(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

export function newMessage(profileId: string, role: ChatMessage['role'], text: string, card?: Card): ChatMessage {
  const now = messageStamp();
  return { id: uid(), profileId, role, text, card, createdAt: now, updatedAt: now };
}

export async function loadChat(profileId: string, limit = 150): Promise<ChatMessage[]> {
  const all = await db.getByProfile<ChatMessage>('chatMessages', profileId);
  all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return all.slice(-limit);
}

export async function saveMessage(m: ChatMessage): Promise<void> {
  await db.put('chatMessages', m);
}

/** Marks a chat meal card as saved when the entry was saved from the full Food screen. */
export async function markCardSaved(messageId: string, entryId: string): Promise<void> {
  const all = await db.getAll<ChatMessage>('chatMessages');
  const m = all.find((x) => x.id === messageId);
  const c = m && cardOf(m);
  if (!m || !c || c.type !== 'meal') return;
  await db.put('chatMessages', { ...m, card: { ...c, status: 'saved', entryId }, updatedAt: nowIso() });
}

/** The coaching reply after a meal is confirmed: where the day stands, then what to eat next. */
export function followUpText(r: RecResult): string {
  return r.headline;
}
