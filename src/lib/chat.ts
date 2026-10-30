import type { FoodDef, LoggedItem, MealCategory } from './types';
import type { FoodIndex, ParsedLine } from './parser';
import { parseFoodText, matchFood } from './parser';
import { nutrientsFor, recalcItem } from './nutrition';
import type { Constraints } from './recommend';
import { formatQuantity, unitLabel } from './units';

/**
 * Rule-based message interpreter for the chat screen. Deterministic and offline:
 * it decides what the user meant; the app does the arithmetic.
 */

export type NutrientWord = 'calories' | 'protein' | 'carbs' | 'fat' | 'satFat' | 'fiber' | 'solubleFiber' | 'cholesterol' | 'sodium';

export type Intent =
  | { kind: 'log_food'; text: string; meal?: MealCategory; dayOffset: number }
  | { kind: 'correct'; text: string }
  | { kind: 'food_question'; text: string }
  | { kind: 'remaining'; nutrient?: NutrientWord }
  | { kind: 'today' }
  | { kind: 'recommend'; meal?: MealCategory; constraints: Constraints; text: string }
  | { kind: 'weight'; weight: number; dayOffset: number }
  | { kind: 'exercise'; activity: string; minutes: number; distanceMi?: number; intensity?: 'light' | 'moderate' | 'vigorous'; text: string }
  | { kind: 'week_report' }
  | { kind: 'satfat_check' }
  | { kind: 'month_weight' }
  | { kind: 'labs' }
  | { kind: 'help' }
  | { kind: 'unknown'; text: string };

const lc = (s: string) => s.toLowerCase().replace(/[’']/g, "'").trim();

function mealWord(s: string): MealCategory | undefined {
  if (/\bbreakfast\b/.test(s)) return 'breakfast';
  if (/\blunch\b/.test(s)) return 'lunch';
  if (/\b(dinner|supper)\b/.test(s)) return 'dinner';
  if (/\bsnacks?\b/.test(s)) return 'snack';
  return undefined;
}

export function nutrientWord(s: string): NutrientWord | undefined {
  if (/sat(urated)?\.?[- ]?fat/.test(s)) return 'satFat';
  if (/soluble/.test(s)) return 'solubleFiber';
  if (/fib(er|re)/.test(s)) return 'fiber';
  if (/protein/.test(s)) return 'protein';
  if (/carb/.test(s)) return 'carbs';
  if (/cholesterol/.test(s)) return 'cholesterol';
  if (/sodium|salt/.test(s)) return 'sodium';
  if (/\bfat\b/.test(s)) return 'fat';
  if (/calor|kcal|budget/.test(s)) return 'calories';
  return undefined;
}

export function parseConstraints(s: string): Constraints {
  const c: Constraints = {};
  const kcal = s.match(/(?:under|below|less than|max(?:imum)?|up to|<)\s*(\d{2,4})\s*(?:k?cal|calories)?/);
  if (kcal) c.maxKcal = Number(kcal[1]);
  const prot = s.match(/(?:at least|over|more than|>)\s*(\d{1,3})\s*g(?:rams)?\s*(?:of\s+)?protein/);
  if (prot) c.minProtein = Number(prot[1]);
  if (/high[- ]?protein|lots of protein|more protein|protein[- ]packed/.test(s)) c.highProtein = true;
  if (/low (in )?sat(urated)?([- ]fat)?|low[- ]sat|heart[- ]healthy|cholesterol[- ]friendly|ldl/.test(s)) c.lowSatFat = true;
  if (/high[- ]?fib(er|re)|more fib(er|re)|soluble/.test(s)) c.highFiber = true;
  return c;
}

const CORRECTION_START = /^(actually|wait|oops|sorry|correction|no[,.]|nope|scratch that|make (it|that)|change|instead|it was|that was|i only|only|just|remove|delete|drop|without|minus|take (off|out)|also|add|plus|forgot|and also|less|more|half)\b/;
const LOG_VERB = /\b(i (just )?(had|ate|drank|finished|grabbed|got)|i've had|for (breakfast|lunch|dinner|supper)|as a snack|log|add|track|record|ate|had)\b/;
const QUESTION_START = /^(how|what|what's|whats|am|is|are|was|were|have|has|can|could|should|would|will|does|do|did|which|why|when|tell me|show me)\b/;

export function classify(raw: string, hasPending: boolean): Intent {
  const s = lc(raw);
  if (!s) return { kind: 'unknown', text: raw };
  const dayOffset = /\byesterday\b/.test(s) ? -1 : 0;

  if (/^(help|\?|what can you do|commands)\b/.test(s)) return { kind: 'help' };

  // weigh-in: "I weighed 242 this morning", "weight 241.6", "242 lbs today"
  const w = s.match(/\b(?:weigh(?:ed|s)?|weight(?: is| was| today| this morning)?|scale (?:said|says|read))\b\D{0,25}?(\d{2,3}(?:\.\d+)?)/) ?? s.match(/^(\d{2,3}(?:\.\d+)?)\s*(?:lb|lbs|pounds)\b(?:\s+(?:this morning|today))?$/);
  if (w && !QUESTION_START.test(s)) {
    const v = Number(w[1]);
    if (v >= 70 && v <= 700) return { kind: 'weight', weight: v, dayOffset };
  }

  // blood tests
  if (/\b(ldl|hdl|lipid|blood (test|work|panel)|lab results?|triglycerides?)\b|cholesterol (trend|result|test|level|number|history)s?|cholesterol over time/.test(s)) return { kind: 'labs' };

  if (/(consistent|often|usually|regularly|always|every day|most days|too much).{0,40}sat(urated)?[- ]?fat|sat(urated)?[- ]?fat.{0,40}(consistent|often|usually|lately|this week|too much|over|exceed)/.test(s) && QUESTION_START.test(s)) return { kind: 'satfat_check' };

  if (/(this|past|last) (week|7 days)|weekly|how('ve| have) i (done|been doing)|what should i (improve|work on|change)/.test(s) && !/\b(eat|have|cook)\b.*\b(dinner|lunch|breakfast)\b/.test(s)) return { kind: 'week_report' };

  if (/(weight|lost|gained|weigh).{0,30}(this|past|last) (month|30 days)|how has my weight|weight (trend|change|progress)/.test(s)) return { kind: 'month_weight' };

  if (/(left|remaining|to go|still need|do i have|have i got|budget)\b/.test(s) && (QUESTION_START.test(s) || s.endsWith('?')) && !/\b(eat|suggest|recommend|idea)\b/.test(s)) {
    return { kind: 'remaining', nutrient: nutrientWord(s) };
  }

  if (/how am i doing|today'?s (totals?|summary|numbers)|what have i (eaten|had|logged) today|^(summary|totals|status)\??$|show (me )?today/.test(s)) return { kind: 'today' };

  if (/what (should|can|could) i (eat|have|make|cook)|suggest|recommend|ideas?\b|give me (a|an|some|\d)|what'?s (a )?good|meal plan|plan (my|a) (meal|dinner|lunch|breakfast)|what to eat|hungry/.test(s)) {
    return { kind: 'recommend', meal: mealWord(s), constraints: parseConstraints(s), text: raw };
  }

  if (hasPending && CORRECTION_START.test(s)) return { kind: 'correct', text: raw };

  // exercise: "walked 30 minutes", "ran 3 miles in 28 min", "lifted for an hour"
  const ex = s.match(/\b(walked|walk|ran|run|jogged|jog|biked|cycled|rode|swam|swim|lifted|weights|hiked|hike|rowed|elliptical|yoga|played \w+|worked out|workout)\b/);
  const mins = s.match(/(\d+(?:\.\d+)?)\s*(min|minutes|mins|hr|hrs|hour|hours)\b/) ?? (/\ban hour\b/.test(s) ? ['', '1', 'hour'] : /\bhalf (an )?hour\b/.test(s) ? ['', '30', 'min'] : null);
  if (ex && mins && !QUESTION_START.test(s)) {
    const m = Number(mins[1]) * (/^h/.test(mins[2]) ? 60 : 1);
    const dist = s.match(/(\d+(?:\.\d+)?)\s*(mi|miles?)\b/);
    const verb = ex[1];
    const activity = /walk/.test(verb) ? 'walking' : /ran|run|jog/.test(verb) ? 'running' : /bik|cycl|rode/.test(verb) ? 'cycling' : /swam|swim/.test(verb) ? 'swimming' : /lift|weights/.test(verb) ? 'strength' : /hik/.test(verb) ? 'hiking' : /row/.test(verb) ? 'rowing' : /elliptical/.test(verb) ? 'elliptical' : /yoga/.test(verb) ? 'yoga' : /played/.test(verb) ? 'sports' : 'other';
    const intensity = /hard|intense|vigorous|fast|brisk/.test(s) ? 'vigorous' : /easy|light|slow|leisurely/.test(s) ? 'light' : 'moderate';
    if (m > 0 && m <= 1440) return { kind: 'exercise', activity, minutes: m, distanceMi: dist ? Number(dist[1]) : undefined, intensity, text: raw };
  }

  // a question about a food is never a log instruction
  const isQuestion = QUESTION_START.test(s) || /\?\s*$/.test(s);
  if (isQuestion && !/^(log|add|track|record)\b/.test(s)) return { kind: 'food_question', text: raw };

  if (LOG_VERB.test(s) || /^[\d½¼¾a-z]/.test(s)) return { kind: 'log_food', text: raw, meal: mealWord(s), dayOffset };
  return { kind: 'unknown', text: raw };
}

/** Removes conversational framing so the parser sees just the food. */
export function stripFraming(text: string): string {
  return text
    .replace(/\b(for|at|with my|as a) (breakfast|lunch|dinner|supper|snack)\b/gi, ' ')
    .replace(/\b(this morning|this afternoon|tonight|today|yesterday|earlier|just now)\b/gi, ' ')
    .replace(/^\s*(please\s+)?(log|add|track|record)\s*(that\s+)?(i\s+(had|ate|drank))?\s*:?/i, ' ')
    .replace(/^\s*(i\s+)?(just\s+)?(had|ate|drank|finished|grabbed|got|i've had)\s+/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Turns "how many calories in a slice of pizza?" into "a slice of pizza". */
export function questionSubject(text: string): string {
  return text
    .replace(/[?!.]+\s*$/, '')
    .replace(/^\s*(how (many|much) (calories|kcal|protein|fat|saturated fat|sat fat|fiber|carbs|sodium|cholesterol)( are| is| does)?( there)?( in)?|what'?s in|what is in|nutrition (for|of|in)|is|are|can i (have|eat)|should i (have|eat)|would|could i (have|eat)|how bad is|how healthy is|is it ok(ay)? (to have|if i have)|tell me about)\s+/i, '')
    .replace(/\b(ok(ay)?|good|bad|healthy|fine|allowed)( for me| to eat| tonight| today)?$/i, '')
    .replace(/\b(tonight|today|for (dinner|lunch|breakfast))$/i, '')
    .trim();
}

// ---------- corrections to a pending meal ----------

export interface PendingLine {
  key: string;
  item: LoggedItem | null;
  raw: string;
  notes: string[];
  needsUnit?: boolean;
}

export interface CorrectionResult {
  lines: PendingLine[];
  changes: string[];
  understood: boolean;
}

function tokensOf(s: string): string[] {
  return lc(s).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2).map((t) => (t.endsWith('s') && t.length > 4 ? t.slice(0, -1) : t));
}

function findLine(lines: PendingLine[], text: string, index: FoodIndex): number {
  const m = matchFood(text, index);
  if (m.best) {
    const i = lines.findIndex((l) => l.item?.foodId === m.best!.food.id);
    if (i >= 0) return i;
  }
  const want = tokensOf(text);
  let best = -1;
  let bestHits = 0;
  lines.forEach((l, i) => {
    const have = tokensOf(`${l.item?.name ?? ''} ${l.raw}`);
    const hits = want.filter((t) => have.includes(t)).length;
    if (hits > bestHits) {
      best = i;
      bestHits = hits;
    }
  });
  return best;
}

function describeItem(i: LoggedItem): string {
  return `${formatQuantity(i.quantity)} ${unitLabel(i.unit, i.quantity)} ${shortName(i.name)}`;
}

const PREP = /^(cooked|raw|boiled|poached|boiled or poached|roasted|roasted or grilled|grilled|baked|prepared|dry|plain|regular|with skin|flesh and skin|drained|deli sliced|sliced)$/;

/** "Bacon, turkey, cooked" → "turkey bacon"; "Egg, whole, boiled or poached" → "whole egg". */
export function shortName(name: string): string {
  if (!name.includes(',')) return name.toLowerCase();
  const parts = name.split(',').map((p) => p.trim()).filter((p) => p && !PREP.test(p.toLowerCase()));
  return parts.reverse().join(' ').toLowerCase();
}

function lineFrom(p: ParsedLine): PendingLine {
  return { key: p.id, item: p.item ?? null, raw: p.raw, notes: p.notes, needsUnit: p.needsUnit };
}

/**
 * Applies a conversational correction to the pending meal without creating a new entry.
 * Handles: quantity changes ("actually half a tablespoon of butter"), removals ("no bacon"),
 * additions ("also a coffee"), and swaps ("it was turkey bacon").
 */
export function applyCorrection(lines: PendingLine[], text: string, index: FoodIndex, foodById: (id?: string) => FoodDef | undefined): CorrectionResult {
  let s = lc(text).replace(/^(actually|wait|oops|sorry|correction|no,|nope|scratch that)[,.:!]?\s*/, '');
  const out = lines.map((l) => ({ ...l, item: l.item ? { ...l.item } : null }));
  const changes: string[] = [];

  const rm = s.match(/^(?:remove|delete|drop|take (?:off|out)|without|minus|no|skip|didn't have|didnt have)\s+(?:the\s+)?(.+)$/);
  if (rm) {
    const i = findLine(out, rm[1], index);
    if (i < 0) return { lines, changes: [], understood: false };
    changes.push(`Removed ${out[i].item ? describeItem(out[i].item!) : out[i].raw}.`);
    out.splice(i, 1);
    return { lines: out, changes, understood: true };
  }

  const add = s.match(/^(?:also|add|plus|and also|forgot|i forgot|and)\s+(?:i (?:had|ate|drank)\s+)?(.+)$/);
  if (add) {
    const parsed = parseFoodText(add[1], index).lines.map(lineFrom);
    if (!parsed.length) return { lines, changes: [], understood: false };
    for (const p of parsed) changes.push(p.item ? `Added ${describeItem(p.item)}.` : `Added “${p.raw}” (not in the food list yet).`);
    return { lines: [...out, ...parsed], changes, understood: true };
  }

  s = s
    .replace(/^(make (it|that)|change (it|that)? ?to|it was|that was|it's|there (was|were)|i (only )?(used|had|ate|put)|only|just|instead)\s+/, '')
    .replace(/^(only|just)\s+/, '')
    .replace(/\b(instead|not \w+( \w+)?)$/, '')
    .trim();
  const parsed = parseFoodText(s, index).lines;
  for (const p of parsed) {
    if (!p.item) continue;
    const i = findLine(out, p.raw, index);
    if (i >= 0 && out[i].item) {
      const old = out[i].item!;
      if (old.foodId === p.item.foodId) {
        // same food: change the amount, recalculating from the database
        const explicit = /\d|half|quarter|one|two|three|four|five|a |an /.test(p.raw.toLowerCase());
        if (!explicit) continue;
        const food = foodById(old.foodId);
        const next: LoggedItem = { ...old, quantity: p.item.quantity, unit: p.item.unit, estimated: false };
        const n = recalcItem(next, food) ?? p.item.nutrients;
        out[i] = { ...out[i], item: { ...next, nutrients: n, manualOverride: false }, notes: [] };
        changes.push(`Changed to ${describeItem(out[i].item!)}.`);
      } else {
        // a different food that shares a word: swap it, keeping the old amount when none was given
        const food = foodById(p.item.foodId);
        const keepQty = !/\d|half|quarter/.test(p.raw.toLowerCase()) && food && nutrientsFor(food, old.quantity, old.unit);
        const item = keepQty ? { ...p.item, quantity: old.quantity, unit: old.unit, nutrients: nutrientsFor(food!, old.quantity, old.unit)! } : p.item;
        out[i] = { key: out[i].key, item, raw: p.raw, notes: p.notes };
        changes.push(`Swapped ${shortName(old.name)} for ${describeItem(item)}.`);
      }
    } else {
      out.push(lineFrom(p));
      changes.push(`Added ${describeItem(p.item)}.`);
    }
  }
  return { lines: out, changes, understood: changes.length > 0 };
}
