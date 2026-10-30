import type { LoggedItem, Nutrients } from './types';
import { uid } from './id';

export const CHATGPT_URL = 'https://chatgpt.com/';

export function buildFoodPrompt(description: string, opts: { photo?: boolean } = {}): string {
  const desc = description.trim() || (opts.photo ? '(See the attached photo.)' : '');
  return [
    opts.photo ? 'Estimate the nutrition for the food in the attached photo, using the description below where it helps.' : 'Estimate the nutrition for the following food entry.',
    '',
    'Food description:',
    desc,
    '',
    'Use reasonable portions and clearly state assumptions, including likely additions such as cooking oil, butter, sauces, or dressing. If important information is missing, ask one concise follow-up question rather than inventing details.',
    '',
    'For each food item return: name, quantity and unit, calories (kcal), protein (g), total carbohydrates (g, including fiber), total fat (g), saturated fat (g), total fiber (g), soluble fiber (g) only if it can be reasonably estimated, dietary cholesterol (mg), and sodium (mg).',
    'Use null for any value you cannot reasonably estimate. Do not use 0 to mean unknown.',
    '',
    'Use plausible estimates from common nutrition references. Avoid false precision. Mark uncertain items.',
    '',
    'Finish with a JSON code block in exactly this shape so it can be pasted into a nutrition tracker:',
    '```json',
    '{"items":[{"name":"","quantity":1,"unit":"","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"saturated_fat_g":0,"fiber_g":0,"soluble_fiber_g":null,"cholesterol_mg":0,"sodium_mg":0,"uncertain":false}],"assumptions":"","totals":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"saturated_fat_g":0,"fiber_g":0}}',
    '```',
  ].join('\n');
}

export interface PlanContext {
  request: string;
  remaining: { calories: number; protein: number; satFat: number; fiber: number };
  meal?: string;
}

/**
 * Meal-planning prompt. Contains only today's remaining targets and the request,
 * never weight, history, or lab results.
 */
export function buildPlanPrompt(ctx: PlanContext): string {
  const r = ctx.remaining;
  return [
    `I'm trying to lose weight and lower my LDL cholesterol through diet. ${ctx.request.trim() || `Suggest ${ctx.meal ?? 'a meal'} ideas.`}`,
    '',
    'What I have left for today:',
    `- Calories: about ${Math.max(0, Math.round(r.calories))} kcal`,
    `- Protein still needed: about ${Math.max(0, Math.round(r.protein))} g`,
    `- Saturated fat allowance left: about ${Math.max(0, Math.round(r.satFat))} g`,
    `- Fiber still needed: about ${Math.max(0, Math.round(r.fiber))} g`,
    '',
    'Give 2 or 3 specific options with portions. Prefer unsaturated fats over saturated fats, and foods with soluble fiber such as oats, beans, lentils, and fruit. For each option list estimated calories, protein, saturated fat, and fiber. Keep it practical; no medical advice.',
    '',
    'For the option I pick, I will ask you for a JSON nutrition breakdown afterwards.',
  ].join('\n');
}

export interface ImportedItem {
  name: string;
  quantity: number;
  unit: string;
  nutrients: Nutrients;
  uncertain: boolean;
  problems: string[];
}

export interface ImportResult {
  items: ImportedItem[];
  assumptions?: string;
  format: 'json' | 'table' | 'lines' | 'none';
  errors: string[];
  totals?: Nutrients;
}

const LIMITS: Record<keyof Nutrients, number> = { calories: 5000, protein: 400, carbs: 800, fat: 400, fiber: 150, satFat: 200, solubleFiber: 60, cholesterol: 3000, sodium: 20000 };

/** "210", "~210", "210 kcal", "200-250" (midpoint), "12.5g" */
export function parseNumber(v: unknown): { value: number | null; approx: boolean } {
  if (typeof v === 'number') return { value: Number.isFinite(v) ? v : null, approx: false };
  if (typeof v !== 'string') return { value: null, approx: false };
  const s = v.replace(/,/g, '').trim();
  const range = s.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
  if (range) return { value: (Number(range[1]) + Number(range[2])) / 2, approx: true };
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return { value: null, approx: false };
  return { value: Number(m[0]), approx: /[~≈]|about|approx/i.test(s) };
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of Object.keys(obj)) {
    const norm = k.toLowerCase().replace(/[^a-z]/g, '');
    if (keys.includes(norm)) return obj[k];
  }
  return undefined;
}

const KEYMAP: Record<keyof Nutrients, string[]> = {
  calories: ['calories', 'kcal', 'calorieskcal', 'energy', 'energykcal', 'cal'],
  protein: ['protein', 'proteing', 'proteingrams'],
  carbs: ['carbs', 'carbsg', 'carbohydrates', 'carbohydratesg', 'carbohydrate', 'carbohydrateg', 'totalcarbs', 'totalcarbsg', 'totalcarbohydratesg', 'carbohydratesgrams'],
  fat: ['fat', 'fatg', 'totalfat', 'totalfatg', 'fatgrams'],
  fiber: ['fiber', 'fiberg', 'fibre', 'fibreg', 'dietaryfiber', 'totalfiber', 'totalfiberg', 'fibergrams'],
  satFat: ['saturatedfat', 'saturatedfatg', 'satfat', 'satfatg', 'saturatedfatgrams'],
  solubleFiber: ['solublefiber', 'solublefiberg', 'solublefibre', 'solublefibreg'],
  cholesterol: ['cholesterol', 'cholesterolmg', 'dietarycholesterol', 'dietarycholesterolmg'],
  sodium: ['sodium', 'sodiummg'],
};

const OPTIONAL_KEYS: (keyof Nutrients)[] = ['satFat', 'solubleFiber', 'cholesterol', 'sodium'];

function itemFromObject(o: Record<string, unknown>): ImportedItem | null {
  const name = pick(o, ['name', 'food', 'foodname', 'item', 'description']);
  if (typeof name !== 'string' || !name.trim()) return null;
  const problems: string[] = [];
  let uncertain = pick(o, ['uncertain', 'estimated', 'isuncertain']) === true;
  const n: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const key of Object.keys(KEYMAP) as (keyof Nutrients)[]) {
    const raw = pick(o, KEYMAP[key]);
    const { value, approx } = parseNumber(raw);
    if (approx) uncertain = true;
    if (raw === undefined || raw === null || raw === '' || (typeof raw === 'string' && /^(n\/?a|unknown|null|-|–)$/i.test(raw.trim()))) {
      // unknown stays unknown: optional nutrients are left out, required ones are flagged
      if (OPTIONAL_KEYS.includes(key)) continue;
      problems.push(key === 'fiber' ? 'Fiber not given. Enter it, or 0 if there is none.' : `Missing ${key}.`);
      continue;
    }
    if (value === null) problems.push(`${key} is not a number.`);
    else if (value < 0) problems.push(`${key} can’t be negative.`);
    else if (value > LIMITS[key]) problems.push(`${key} of ${value} looks too high for one item.`);
    else n[key] = value;
  }
  if (n.satFat !== undefined && n.satFat > n.fat + 0.5) problems.push('Saturated fat is larger than total fat.');
  if (n.solubleFiber !== undefined && n.solubleFiber > n.fiber + 0.5) problems.push('Soluble fiber is larger than total fiber.');
  let quantity = 1;
  let unit = 'serving';
  const qRaw = pick(o, ['quantity', 'qty', 'amount', 'servings']);
  const uRaw = pick(o, ['unit', 'units', 'servingunit']);
  const qv = parseNumber(qRaw).value;
  if (qv !== null && qv > 0) quantity = qv;
  if (typeof uRaw === 'string' && uRaw.trim()) unit = uRaw.trim();
  else if (typeof qRaw === 'string') {
    const m = qRaw.match(/^\s*[\d.\/\s]+\s*(.+)$/);
    if (m) unit = m[1].trim();
  }
  if (n.fiber > n.carbs && n.carbs > 0) problems.push('Fiber is larger than total carbs.');
  return { name: name.trim(), quantity, unit, nutrients: n, uncertain, problems };
}

function totalsFrom(o: unknown): Nutrients | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const it = itemFromObject({ name: 'Totals', ...(o as Record<string, unknown>) });
  return it ? it.nutrients : undefined;
}

function tryJson(text: string): ImportResult | null {
  const candidates: string[] = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  if (fence) for (const f of fence) candidates.push(f.replace(/```(?:json)?/i, '').replace(/```$/, ''));
  const first = text.search(/[\[{]/);
  const last = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    let data: unknown;
    try {
      data = JSON.parse(c.trim());
    } catch {
      continue;
    }
    const arr = Array.isArray(data) ? data : (data as Record<string, unknown>)?.items ?? (data as Record<string, unknown>)?.foods ?? (data as Record<string, unknown>)?.food_items;
    if (!Array.isArray(arr)) continue;
    const items = arr.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').map(itemFromObject).filter((x): x is ImportedItem => !!x).filter((x) => !/^(meal\s+)?totals?$/i.test(x.name));
    if (!items.length) continue;
    const asm = Array.isArray(data) ? undefined : (data as Record<string, unknown>).assumptions;
    return { items, format: 'json', errors: [], totals: Array.isArray(data) ? undefined : totalsFrom((data as Record<string, unknown>).totals), assumptions: typeof asm === 'string' && asm.trim() ? asm.trim() : Array.isArray(asm) ? asm.join(' ') : undefined };
  }
  return null;
}

function tryTable(text: string): ImportResult | null {
  const rows = text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && l.endsWith('|'));
  if (rows.length < 3) return null;
  const cells = (r: string) => r.slice(1, -1).split('|').map((c) => c.trim().replace(/\*\*/g, ''));
  const header = cells(rows[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const items: ImportedItem[] = [];
  for (const r of rows.slice(1)) {
    if (/^\|?\s*:?-{2,}/.test(r)) continue;
    const c = cells(r);
    const obj: Record<string, unknown> = {};
    header.forEach((h, i) => (obj[h] = c[i]));
    // a "quantity" column like "2 large" with no unit column
    const item = itemFromObject(obj);
    if (item && !/^(meal\s+)?totals?$/i.test(item.name)) items.push(item);
  }
  return items.length ? { items, format: 'table', errors: [] } : null;
}

/** "Scrambled eggs (2 large): 180 kcal, 12 g protein, 2 g carbs, 14 g fat, 0 g fiber" */
function tryLines(text: string): ImportResult | null {
  const items: ImportedItem[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\*\*/g, '').replace(/^[\s\-*•\d.)]+/, '').trim();
    const kcal = line.match(/(\d+(?:\.\d+)?)\s*(?:kcal|calories|cal)\b/i);
    if (!kcal) continue;
    const name = line.split(/[:–—]|\s-\s/)[0].trim();
    if (!name || /^(meal\s+)?totals?\b/i.test(name)) continue;
    const g = (label: RegExp) => {
      const m = line.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*g\\s*(?:of\\s+)?${label.source}`, 'i')) ?? line.match(new RegExp(`${label.source}\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*g`, 'i'));
      return m ? Number(m[1]) : undefined;
    };
    const obj: Record<string, unknown> = { name, calories: Number(kcal[1]), protein: g(/protein/), carbs: g(/carb(?:ohydrate)?s?/), fat: g(/fat/), fiber: g(/fib(?:er|re)/) };
    const paren = name.match(/\(([^)]+)\)/);
    if (paren) {
      obj.name = name.replace(/\s*\([^)]+\)/, '').trim();
      obj.quantity = paren[1];
    }
    const it = itemFromObject(obj);
    if (it) items.push(it);
  }
  return items.length ? { items, format: 'lines', errors: [] } : null;
}

export function parseChatGptResponse(text: string): ImportResult {
  if (!text.trim()) return { items: [], format: 'none', errors: ['Paste ChatGPT’s answer first.'] };
  const result = tryJson(text) ?? tryTable(text) ?? tryLines(text);
  if (!result) return { items: [], format: 'none', errors: ['Couldn’t find nutrition values. Paste the JSON block from the end of ChatGPT’s answer, or enter the values by hand.'] };
  return result;
}

export function importedToLogged(it: ImportedItem): LoggedItem {
  return {
    id: uid(),
    name: it.name,
    quantity: it.quantity,
    unit: it.unit,
    nutrients: { ...it.nutrients },
    source: 'ai',
    estimated: true,
    ref: { quantity: it.quantity, unit: it.unit, nutrients: { ...it.nutrients } },
    note: it.uncertain ? 'ChatGPT marked this as uncertain.' : undefined,
  };
}
