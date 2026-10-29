export const G_PER_OZ = 28.349523125;
export const G_PER_LB = 453.59237;
export const ML_PER_CUP = 236.5882365;
export const ML_PER_FLOZ = 29.5735295625;
export const ML_PER_TBSP = 14.78676478125;
export const ML_PER_TSP = 4.92892159375;

/** alias -> canonical unit */
const UNIT_ALIASES: Record<string, string> = {
  g: 'g', gram: 'g', grams: 'g', gm: 'g', gms: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  'fl oz': 'fl oz', 'fl. oz': 'fl oz', floz: 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz', 'fl oz.': 'fl oz',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  cup: 'cup', cups: 'cup', c: 'cup',
  tbsp: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbsps: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
  slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece',
  scoop: 'scoop', scoops: 'scoop',
  strip: 'slice', strips: 'slice',
  link: 'link', links: 'link',
  patty: 'patty', patties: 'patty',
  can: 'can', cans: 'can',
  bottle: 'bottle', bottles: 'bottle',
  glass: 'glass', glasses: 'glass',
  mug: 'cup', mugs: 'cup',
  handful: 'handful', handfuls: 'handful',
  serving: 'serving', servings: 'serving',
  container: 'container', containers: 'container', cartons: 'container', carton: 'container',
  stick: 'stick', sticks: 'stick',
  bar: 'bar', bars: 'bar',
  shot: 'shot', shots: 'shot',
  pat: 'pat', pats: 'pat',
  ear: 'ear', ears: 'ear',
  stalk: 'stalk', stalks: 'stalk',
  spear: 'spear', spears: 'spear',
  fillet: 'fillet', fillets: 'fillet', filet: 'fillet', filets: 'fillet',
  square: 'square', squares: 'square',
  wedge: 'wedge', wedges: 'wedge',
  packet: 'packet', packets: 'packet',
  box: 'box', boxes: 'box',
  large: 'large', big: 'large', medium: 'medium', med: 'medium', small: 'small',
  'extra large': 'extra large', xl: 'extra large', jumbo: 'jumbo',
  each: 'each', whole: 'each',
  breast: 'breast', breasts: 'breast',
  thigh: 'thigh', thighs: 'thigh',
  wing: 'wing', wings: 'wing',
  chop: 'chop', chops: 'chop',
  half: 'half',
};

/** units that can be typed as a measurement before a food name */
export const MULTIWORD_UNITS = ['fl oz', 'fl. oz', 'fluid ounce', 'fluid ounces', 'extra large'];

export function canonicalUnit(raw: string): string | null {
  const k = raw.trim().toLowerCase().replace(/\.$/, '');
  return UNIT_ALIASES[k] ?? null;
}

export const MASS_UNITS = ['g', 'kg', 'oz', 'lb'];
export const VOLUME_UNITS = ['ml', 'l', 'cup', 'tbsp', 'tsp', 'fl oz'];
/** size words describe the food rather than measure it */
export const SIZE_UNITS = ['small', 'medium', 'large', 'extra large', 'jumbo'];

export function massToGrams(qty: number, unit: string, liquid = false): number | null {
  switch (unit) {
    case 'g': return qty;
    case 'kg': return qty * 1000;
    case 'oz': return liquid ? null : qty * G_PER_OZ;
    case 'lb': return qty * G_PER_LB;
    default: return null;
  }
}

/** For liquids, plain "oz" is read as fluid ounces. */
export function volumeToMl(qty: number, unit: string, liquid = false): number | null {
  switch (unit) {
    case 'ml': return qty;
    case 'l': return qty * 1000;
    case 'cup': return qty * ML_PER_CUP;
    case 'glass': return liquid ? qty * ML_PER_CUP : null;
    case 'tbsp': return qty * ML_PER_TBSP;
    case 'tsp': return qty * ML_PER_TSP;
    case 'fl oz': return qty * ML_PER_FLOZ;
    case 'oz': return liquid ? qty * ML_PER_FLOZ : null;
    default: return null;
  }
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, twenty: 20, dozen: 12,
  half: 0.5, quarter: 0.25, single: 1, couple: 2, few: 3, several: 3,
};

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

export interface QuantityParse {
  quantity: number;
  rest: string;
  matched: boolean; // an explicit quantity was found
  approximate: boolean; // vague words (couple, few, range)
}

/**
 * Pulls a leading quantity from text.
 * Handles: 2, 2.5, 1/2, 1 1/2, ½, 1½, two, a, an, half, a half, a couple (of), 1-2, 1 to 2.
 */
export function parseLeadingQuantity(input: string): QuantityParse {
  let s = input.trim().toLowerCase();
  for (const [ch, v] of Object.entries(UNICODE_FRACTIONS)) {
    s = s.replace(new RegExp(`(\\d)\\s*${ch}`, 'g'), (_m, d) => `${Number(d) + v} `);
    s = s.replace(new RegExp(ch, 'g'), ` ${v} `);
  }
  s = s.replace(/\s+/g, ' ').trim();

  // range: 1-2 or 1 to 2 (not followed by %)
  let m = s.match(/^(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)(?![\d%])\s*(.*)$/);
  if (m) {
    return { quantity: (Number(m[1]) + Number(m[2])) / 2, rest: m[3], matched: true, approximate: true };
  }
  // mixed fraction 1 1/2
  m = s.match(/^(\d+)\s+(\d+)\/(\d+)(?![\d%])\s*(.*)$/);
  if (m && Number(m[3]) !== 0) {
    return { quantity: Number(m[1]) + Number(m[2]) / Number(m[3]), rest: m[4], matched: true, approximate: false };
  }
  // fraction 1/2
  m = s.match(/^(\d+)\/(\d+)(?![\d%])\s*(.*)$/);
  // "80/20 beef" and "93/7" are lean ratios, not fractions
  if (m && Number(m[2]) !== 0 && Number(m[2]) <= 16 && Number(m[1]) <= Number(m[2]) * 4) {
    return { quantity: Number(m[1]) / Number(m[2]), rest: m[3], matched: true, approximate: false };
  }
  // decimal / integer, possibly glued to a unit (8oz, 250g) but not a percentage (2% milk)
  m = s.match(/^(\d+(?:\.\d+)?|\.\d+)(?![\d.%/])\s*(.*)$/);
  if (m) {
    return { quantity: Number(m[1]), rest: m[2], matched: true, approximate: false };
  }
  // words
  const words = s.split(' ');
  // "an 8 oz steak": the article is not the quantity
  if ((words[0] === 'a' || words[0] === 'an') && /^[\d.½¼¾⅓⅔]/.test(words[1] ?? '')) {
    return parseLeadingQuantity(words.slice(1).join(' '));
  }
  if (words.length && words[0] in NUMBER_WORDS) {
    let q = NUMBER_WORDS[words[0]];
    let i = 1;
    let approximate = ['couple', 'few', 'several'].includes(words[0]);
    // "a half", "a couple", "a few", "a dozen", "a quarter"
    if ((words[0] === 'a' || words[0] === 'an') && words[1] && words[1] in NUMBER_WORDS && !['a', 'an'].includes(words[1])) {
      q = NUMBER_WORDS[words[1]];
      approximate = ['couple', 'few', 'several'].includes(words[1]);
      i = 2;
    }
    // "one and a half"
    if (words[i] === 'and' && (words[i + 1] === 'a' || words[i + 1] === 'an') && words[i + 2] === 'half') {
      q += 0.5;
      i += 3;
    }
    // "half a cup" / "half an avocado"
    if (q === 0.5 && (words[i] === 'a' || words[i] === 'an')) i += 1;
    if (words[i] === 'of') i += 1;
    return { quantity: q, rest: words.slice(i).join(' '), matched: true, approximate };
  }
  return { quantity: 1, rest: s, matched: false, approximate: false };
}

/** Pulls a leading unit, if present. Returns canonical unit or null. */
export function parseLeadingUnit(input: string): { unit: string | null; rest: string } {
  const s = input.trim().toLowerCase();
  for (const mw of MULTIWORD_UNITS) {
    if (s === mw || s.startsWith(mw + ' ')) {
      return { unit: canonicalUnit(mw), rest: stripOf(s.slice(mw.length)) };
    }
  }
  const m = s.match(/^([a-z.]+)\b\s*(.*)$/);
  if (m) {
    const u = canonicalUnit(m[1]);
    if (u && u !== 'half') {
      // a size word is only a unit when something follows ("large egg"), never the whole name
      if (!m[2]) return { unit: null, rest: s };
      return { unit: u, rest: stripOf(m[2]) };
    }
  }
  return { unit: null, rest: s };
}

function stripOf(s: string): string {
  return s.trim().replace(/^of\s+/, '').trim();
}

export function formatQuantity(q: number): string {
  if (!Number.isFinite(q)) return '';
  const r = Math.round(q * 100) / 100;
  return String(r);
}

export function unitLabel(unit: string, qty = 1): string {
  const plural: Record<string, string> = {
    cup: 'cups', slice: 'slices', piece: 'pieces', scoop: 'scoops', link: 'links', patty: 'patties', can: 'cans',
    bottle: 'bottles', glass: 'glasses', handful: 'handfuls', serving: 'servings', container: 'containers', stick: 'sticks',
    bar: 'bars', shot: 'shots', pat: 'pats', ear: 'ears', stalk: 'stalks', spear: 'spears', fillet: 'fillets', square: 'squares',
    wedge: 'wedges', packet: 'packets', box: 'boxes', breast: 'breasts', thigh: 'thighs', wing: 'wings', chop: 'chops',
  };
  if (qty !== 1 && plural[unit]) return plural[unit];
  return unit;
}
