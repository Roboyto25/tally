import type { FoodDef, LoggedItem, MealBoundaries, MealCategory } from './types';
import { nutrientsFor } from './nutrition';
import { parseLeadingQuantity, parseLeadingUnit, canonicalUnit, SIZE_UNITS, MASS_UNITS, VOLUME_UNITS, formatQuantity, unitLabel } from './units';
import { uid } from './id';

// ---------- normalization ----------

const STOP = new Set(['of', 'the', 'some', 'my', 'fresh', 'homemade', 'about', 'approximately', 'around', 'roughly', 'like', 'just', 'i', 'had', 'ate', 'a', 'an', 'x', 'piece', 'serving', 'to', 'taste', 'little', 'bit', 'maybe']);

/** Descriptors that don't change which food it is enough to block a match. */
const MODIFIERS = new Set([
  'grilled', 'baked', 'roasted', 'steamed', 'boiled', 'cooked', 'raw', 'sliced', 'chopped', 'diced', 'shredded', 'organic',
  'hot', 'cold', 'iced', 'warm', 'toasted', 'salted', 'unsalted', 'lightly', 'crispy', 'extra', 'skinless', 'boneless',
  'frozen', 'canned', 'regular', 'leftover', 'large', 'medium', 'small', 'big', 'mini', 'thin', 'thick', 'sauteed', 'pan',
  'seared', 'broiled', 'smoked', 'fat', 'free', 'low', 'reduced', 'lean', 'natural', 'pure', 'cup', 'glass', 'bowl', 'side',
  'spicy', 'mild', 'seasoned', 'plain', 'whole', 'fried', 'store', 'bought', 'brand', 'kirkland', 'great', 'value',
]);

/** Words that suggest a dish or restaurant item whose components are uncertain. */
const DISH_WORDS = new Set([
  'bowl', 'burrito', 'sandwich', 'sub', 'hoagie', 'burger', 'cheeseburger', 'taco', 'quesadilla', 'nacho', 'salad', 'soup',
  'stew', 'chili', 'casserole', 'curry', 'stir', 'lasagna', 'sushi', 'combo', 'meal', 'platter', 'smoothie', 'latte',
  'cappuccino', 'frappuccino', 'mocha', 'macchiato', 'milkshake', 'shake', 'pad', 'ramen', 'pho', 'enchilada', 'gyro',
  'kebab', 'pie', 'cake', 'muffin', 'donut', 'doughnut', 'pastry', 'scone', 'brownie', 'cupcake', 'dip', 'roll',
]);

const RESTAURANTS = [
  'chipotle', 'mcdonald', 'mcdonalds', 'starbucks', 'subway', 'chick fil a', 'chickfila', 'wendy', 'wendys', 'taco bell',
  'panera', 'dunkin', 'domino', 'dominos', 'kfc', 'popeye', 'popeyes', 'five guys', 'culver', 'burger king', 'arby', 'arbys',
  'sonic', 'applebee', 'applebees', 'olive garden', 'qdoba', 'panda express', 'jimmy john', 'jersey mike', 'firehouse',
  'shake shack', 'in n out', 'whataburger', 'cava', 'sweetgreen', 'raising cane', 'canes', 'wingstop', 'buffalo wild wings',
  'texas roadhouse', 'outback', 'chilis', 'red robin', 'ihop', 'denny', 'dennys', 'cracker barrel', 'pizza hut', 'papa john',
  'little caesar', 'jets pizza', 'tim hortons', 'potbelly', 'portillo', 'skyline', 'crumbl',
  'big mac', 'whopper', 'baconator', 'frosty', 'mcchicken', 'mcflurry', 'mcmuffin', 'quarter pounder', 'crunchwrap', 'frappuccino',
];

/** Container words: the head of "X with Y, Z" when X is a dish built from the listed parts. */
const CONTAINERS = new Set(['shake', 'smoothie', 'sandwich', 'sub', 'wrap', 'bowl', 'salad', 'burrito', 'plate', 'platter', 'taco', 'quesadilla', 'hoagie']);

function singular(t: string): string {
  if (t.length <= 3) return t;
  if (t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.endsWith('oes')) return t.slice(0, -2);
  if (t.endsWith('ches') || t.endsWith('shes')) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') && !t.endsWith('is')) return t.slice(0, -1);
  return t;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/%/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ');
}

function tokensOf(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((t) => t && !STOP.has(t));
}

function editDistance1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
      i += 2;
      j += 2;
    } else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// ---------- index ----------

interface IndexEntry {
  food: FoodDef;
  tokens: string[];
  assumed: boolean;
  custom: boolean;
}

export interface FoodIndex {
  entries: IndexEntry[];
  foods: FoodDef[];
}

export function buildIndex(foods: FoodDef[]): FoodIndex {
  const entries: IndexEntry[] = [];
  for (const food of foods) {
    // curated synonyms plus the full display name; never a bare name prefix like "Chicken"
    const names = new Set<string>([food.name, ...food.synonyms]);
    for (const raw of names) {
      const assumed = raw.startsWith('~');
      const tokens = tokensOf(assumed ? raw.slice(1) : raw);
      if (tokens.length) entries.push({ food, tokens, assumed, custom: !!food.profileId });
    }
  }
  return { entries, foods };
}

// ---------- matching ----------

export type Confidence = 'high' | 'medium' | 'low';

export interface MatchResult {
  food: FoodDef;
  confidence: Confidence;
  assumed: boolean;
  typo: boolean;
  covered: number[]; // token positions used
  score: number;
}

function findSeq(tokens: string[], seq: string[], fuzzy: boolean): number[] | null {
  outer: for (let i = 0; i + seq.length <= tokens.length; i++) {
    const pos: number[] = [];
    for (let k = 0; k < seq.length; k++) {
      const ok = fuzzy ? editDistance1(tokens[i + k], seq[k]) : tokens[i + k] === seq[k];
      if (!ok) continue outer;
      pos.push(i + k);
    }
    return pos;
  }
  return null;
}

/** Ranks every index entry against the token list. */
function rank(tokens: string[], index: FoodIndex, unit: string | null): MatchResult[] {
  const byFood = new Map<string, MatchResult>();
  const joined = tokens.join(' ');
  for (const e of index.entries) {
    let score = 0;
    let covered: number[] | null = null;
    let typo = false;
    if (joined === e.tokens.join(' ')) {
      score = 1000 + e.tokens.length * 10;
      covered = tokens.map((_, i) => i);
    } else {
      covered = findSeq(tokens, e.tokens, false);
      if (covered) score = 500 + e.tokens.length * 20;
      else {
        covered = findSeq(tokens, e.tokens, true);
        if (covered) {
          score = 300 + e.tokens.length * 20;
          typo = true;
        }
      }
    }
    if (!covered) {
      // weak overlap, used only for suggestions
      const hits = e.tokens.filter((t) => tokens.includes(t)).length;
      if (hits && e.tokens.length >= 2 && hits / e.tokens.length >= 0.5) {
        score = 50 * (hits / e.tokens.length);
        covered = [];
      } else continue;
    }
    if (e.assumed) score -= 250;
    if (e.custom) score += 40;
    // prefer foods that can take the stated unit
    if (unit && score >= 300) {
      const n = nutrientsFor(e.food, 1, unit);
      if (n) score += 15;
      else score -= 120;
    }
    const prev = byFood.get(e.food.id);
    if (!prev || prev.score < score) {
      byFood.set(e.food.id, { food: e.food, score, covered, assumed: e.assumed, typo, confidence: 'low' });
    }
  }
  return [...byFood.values()].sort((a, b) => b.score - a.score);
}

function significantLeftover(tokens: string[], covered: number[]): string[] {
  return tokens.filter((t, i) => !covered.includes(i) && !MODIFIERS.has(t) && !/^\d+$/.test(t));
}

export function matchFood(text: string, index: FoodIndex, unit: string | null = null): { best: MatchResult | null; candidates: FoodDef[]; leftover: string[] } {
  const tokens = tokensOf(text);
  if (!tokens.length) return { best: null, candidates: [], leftover: [] };
  const ranked = rank(tokens, index, unit);
  const candidates = ranked.slice(0, 5).map((r) => r.food);
  const top = ranked[0];
  if (!top || top.score < 200) return { best: null, candidates, leftover: tokens };
  const leftover = significantLeftover(tokens, top.covered);
  const hasDish = leftover.some((t) => DISH_WORDS.has(t));
  let confidence: Confidence = 'high';
  if (top.assumed || top.typo || leftover.length === 1) confidence = 'medium';
  if (leftover.length >= 2 || hasDish) confidence = 'low';
  return { best: { ...top, confidence }, candidates, leftover };
}

// ---------- segmentation ----------

const FILLER = /^(?:and\s+|then\s+|also\s+|i\s+had\s+|i\s+ate\s+|had\s+|ate\s+|about\s+|around\s+|approximately\s+|roughly\s+|maybe\s+|like\s+|plus\s+)+/;

interface Segment {
  text: string;
  header: boolean; // head of "X with ..." where X is a container dish
}

function protectPhrases(text: string, index: FoodIndex): { text: string; restore: (s: string) => string } {
  const phrases = new Set<string>();
  for (const f of index.foods) for (const s of f.synonyms) if (/ and | with |&/.test(s)) phrases.add(s.replace(/^~/, ''));
  phrases.add('salt and pepper');
  let out = text;
  const map: Record<string, string> = {};
  let n = 0;
  for (const p of [...phrases].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\b`, 'gi');
    out = out.replace(re, () => {
      const key = `qqphrase${n++}qq`;
      map[key] = p === 'salt and pepper' ? 'salt, black pepper' : p;
      return key;
    });
  }
  return {
    text: out,
    restore: (s: string) => s.replace(/qqphrase\d+qq/g, (k) => map[k] ?? k),
  };
}

export function segment(input: string, index: FoodIndex): Segment[] {
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, a: 0 };
  const pre = input
    .replace(/\bw\/\s*/gi, ' with ')
    .replace(/\b(\d+|one|two|three|four|a)\s+and\s+(?:a|one)\s+half\b/gi, (_m, n: string) => String((words[n.toLowerCase()] ?? Number(n)) + 0.5));
  const { text, restore } = protectPhrases(pre, index);
  const parts = text.split(/(\n|;|,|\.\s|\bplus\b|\band\b|\bwith\b|\btopped with\b)/i);
  const segs: Segment[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const raw = restore(parts[i] ?? '');
    const sep = (parts[i + 1] ?? '').trim().toLowerCase();
    // a restored phrase may itself contain a comma (salt, black pepper)
    for (const piece of raw.split(',')) {
      const t = piece.replace(FILLER, '').replace(/[.!?]+$/, '').trim();
      if (!t) continue;
      const toks = tokensOf(t);
      const header = sep === 'with' && toks.some((w) => CONTAINERS.has(w));
      segs.push({ text: t, header });
    }
  }
  return segs;
}

// ---------- line parsing ----------

export type LineStatus = 'matched' | 'review' | 'unmatched';

export interface ParsedLine {
  id: string;
  raw: string;
  status: LineStatus;
  item?: LoggedItem;
  needsUnit?: boolean;
  candidates: FoodDef[];
  notes: string[];
}

export interface ParseResult {
  lines: ParsedLine[];
  restaurant: boolean;
  dish: boolean;
}

function extractInlineQuantity(text: string): { quantity: number; unit: string | null; rest: string } | null {
  // "chicken breast 8 oz", "rice (1 cup)", "eggs x2"
  const m = text.match(/\(?\b(\d+(?:\.\d+)?)\s*(fl\.? oz|fluid ounces?|oz|ounces?|g|grams?|lbs?|pounds?|cups?|tbsp|tablespoons?|tsp|teaspoons?|ml|slices?|scoops?|pieces?)\b\)?/i);
  if (m && m.index !== undefined) {
    return { quantity: Number(m[1]), unit: canonicalUnit(m[2]), rest: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).trim() };
  }
  const x = text.match(/\bx\s*(\d+)\b|\b(\d+)\s*x\b/i);
  if (x && x.index !== undefined) {
    return { quantity: Number(x[1] ?? x[2]), unit: null, rest: (text.slice(0, x.index) + ' ' + text.slice(x.index + x[0].length)).trim() };
  }
  return null;
}

function describe(q: number, unit: string): string {
  return `${formatQuantity(q)} ${unitLabel(unit, q)}`;
}

export function makeItem(food: FoodDef, quantity: number, unit: string, extra: Partial<LoggedItem> = {}): LoggedItem | null {
  const n = nutrientsFor(food, quantity, unit);
  if (!n) return null;
  return {
    id: uid(),
    name: food.name,
    quantity,
    unit,
    foodId: food.id,
    nutrients: n,
    source: food.profileId ? 'custom' : 'database',
    estimated: false,
    ...extra,
  };
}

function parseOne(seg: Segment, index: FoodIndex, out: ParsedLine[]): void {
  let text = seg.text;
  // a phrase that is itself a food name ("half and half") skips quantity parsing
  const exact = matchFood(text, index);
  const isExact = !!exact.best && exact.best.score >= 1000 && !exact.best.assumed;
  let q = isExact ? { quantity: 1, rest: text, matched: false, approximate: false } : parseLeadingQuantity(text);
  let quantity = q.quantity;
  let explicitQty = q.matched;
  let approximate = q.approximate;
  let { unit, rest } = isExact ? { unit: null as string | null, rest: text } : parseLeadingUnit(q.rest);
  // "2 large eggs": the size follows the count
  if (!unit && explicitQty) {
    const u2 = parseLeadingUnit(rest);
    unit = u2.unit;
    rest = u2.rest;
  }
  if (!explicitQty && !unit && !isExact) {
    const inline = extractInlineQuantity(text);
    if (inline) {
      quantity = inline.quantity;
      unit = inline.unit;
      rest = inline.rest;
      explicitQty = true;
    }
  }
  // "half a cup", "a cup and a half" (rare) — handled by quantity parser; "half" alone as unit
  if (!isExact && rest.startsWith('half ')) {
    quantity *= 0.5;
    rest = rest.slice(5);
  }
  text = rest;
  const notes: string[] = [];
  if (seg.header) {
    // "a turkey sandwich with …": match the component, not the dish word
    text = tokensOf(text).filter((t) => !CONTAINERS.has(t)).join(' ');
    if (!text) return;
  }

  const { best, candidates, leftover } = matchFood(text, index, unit);

  if (!best || best.confidence === 'low') {
    if (seg.header) return; // dish name like "a protein shake with…": the parts carry the nutrition
    out.push({ id: uid(), raw: seg.text, status: 'unmatched', candidates, notes: best ? [`Not sure this is ${best.food.name}.`] : [] });
    return;
  }

  const food = best.food;
  let estimated = approximate;
  if (seg.header) {
    estimated = true;
    notes.push(`Part of "${seg.text}"; check the amount.`);
  }
  let resolvedUnit = unit ?? food.defaultUnit;
  const isSize = SIZE_UNITS.includes(resolvedUnit);
  if (!unit) {
    if (!explicitQty) {
      estimated = true;
      notes.push(`No amount given; assumed ${describe(quantity, resolvedUnit)}.`);
    } else if (MASS_UNITS.includes(resolvedUnit) || VOLUME_UNITS.includes(resolvedUnit)) {
      // "2 chicken breast" style counts on a weight-based food
      const alt = ['each', 'piece', ...Object.keys(food.portions)].find((u) => food.portions[u] != null && !MASS_UNITS.includes(u));
      if (alt) resolvedUnit = alt;
      else {
        estimated = true;
        notes.push(`Assumed ${describe(quantity, resolvedUnit)}.`);
      }
    } else if (isSize && food.defaultUnit === resolvedUnit && !['egg-whole', 'egg-scrambled', 'egg-fried', 'egg-white'].includes(food.id)) {
      notes.push(`Assumed ${resolvedUnit} size.`);
      estimated = true;
    }
  }
  if (resolvedUnit === 'handful') {
    estimated = true;
    notes.push('A handful is an estimate (about 1 oz).');
  }
  if (approximate) notes.push('Amount was approximate.');
  if (best.assumed) notes.push(`"${text}" assumed to mean ${food.name}.`);
  if (best.typo) notes.push(`Matched "${text}" to ${food.name}.`);
  // "peanut butter toast": a leftover word that is itself a food becomes its own item
  let extra: ParsedLine | null = null;
  if (leftover.length >= 1 && !seg.header) {
    const m2 = matchFood(leftover.join(' '), index);
    if (m2.best && m2.best.confidence !== 'low' && m2.best.food.id !== food.id) {
      const f2 = m2.best.food;
      const it2 = makeItem(f2, 1, f2.defaultUnit, { estimated: true });
      if (it2) extra = { id: uid(), raw: seg.text, status: 'review', item: it2, candidates: m2.candidates, notes: [`Found in "${seg.text}"; assumed ${describe(1, f2.defaultUnit)}.`] };
    }
  }
  if (leftover.length === 1 && !extra) notes.push(`Ignored "${leftover[0]}".`);
  if (food.quality) notes.push(food.quality);

  const item = makeItem(food, quantity, resolvedUnit, { estimated });
  if (!item) {
    out.push({
      id: uid(),
      raw: seg.text,
      status: 'review',
      needsUnit: true,
      item: { id: uid(), name: food.name, quantity, unit: food.defaultUnit, foodId: food.id, nutrients: nutrientsFor(food, quantity, food.defaultUnit)!, source: 'database', estimated: true },
      candidates,
      notes: [`"${unit}" isn't a measure this food supports. Pick a unit.`, ...notes],
    });
    return;
  }
  const status: LineStatus = (best.confidence === 'high' || (extra && !best.assumed && !best.typo)) && !estimated ? 'matched' : 'review';
  out.push({ id: uid(), raw: seg.text, status, item, candidates, notes });
  if (extra) out.push(extra);
}

export function parseFoodText(input: string, index: FoodIndex): ParseResult {
  const lower = ' ' + normalize(input) + ' ';
  const restaurant = RESTAURANTS.some((r) => lower.includes(' ' + normalize(r) + ' '));
  const segs = segment(input, index);
  const lines: ParsedLine[] = [];
  for (const s of segs) parseOne(s, index, lines);
  const dish = segs.some((s) => tokensOf(s.text).some((t) => DISH_WORDS.has(t)));
  return { lines, restaurant, dish };
}

// ---------- meal category ----------

export const DEFAULT_BOUNDARIES: MealBoundaries = { breakfastStart: 4, breakfastEnd: 10.5, lunchEnd: 14.5, dinnerStart: 16.5, dinnerEnd: 21 };

export function defaultMealFor(date: Date, b: MealBoundaries = DEFAULT_BOUNDARIES): MealCategory {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= b.breakfastStart && h < b.breakfastEnd) return 'breakfast';
  if (h >= b.breakfastEnd && h < b.lunchEnd) return 'lunch';
  if (h >= b.dinnerStart && h < b.dinnerEnd) return 'dinner';
  return 'snack';
}
