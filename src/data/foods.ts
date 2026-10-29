import type { FoodDef } from '../lib/types';

/**
 * Bundled food dataset.
 *
 * Values are per 100 g of the food as described (cooked where stated) and were compiled
 * from USDA FoodData Central reference entries (SR Legacy and FNDDS), which are public
 * domain (CC0). Figures were transcribed and rounded by hand for this build; they have not
 * each been re-verified against the live FDC record. Spot-check foods you eat often at
 * https://fdc.nal.usda.gov and save a custom food when your product's label differs.
 *
 * Portion weights are USDA household measures where available, otherwise typical sizes
 * (flagged with a quality note). Entries marked "label" are generic product-label values.
 *
 * Synonyms starting with "~" are generic terms that map to an assumed default
 * (e.g. "chicken" -> roasted breast). The parser flags those matches for review.
 */

type Per = [kcal: number, protein: number, carbs: number, fat: number, fiber: number];
interface Opts {
  liquid?: boolean;
  prep?: string;
  quality?: string;
  src?: string;
}
type Row = [id: string, name: string, category: string, per: Per, portions: Record<string, number>, defaultUnit: string, synonyms: string[], opts?: Opts];

const SR = 'USDA FDC (SR Legacy)';
const FNDDS = 'USDA FDC (FNDDS)';
const LABEL = 'Typical product label';

const OZ = 28.35;

const rows: Row[] = [
  // Eggs
  ['egg-whole', 'Egg, whole, boiled or poached', 'Eggs', [143, 12.6, 0.7, 9.5, 0], { large: 50, medium: 44, small: 38, 'extra large': 56, jumbo: 63, each: 50 }, 'large', ['egg', 'whole egg', 'boiled egg', 'hard boiled egg', 'hard-boiled egg', 'soft boiled egg', 'poached egg', 'large egg'], { prep: 'boiled' }],
  ['egg-scrambled', 'Egg, scrambled', 'Eggs', [149, 10, 1.6, 11, 0], { large: 61, each: 61, cup: 220 }, 'large', ['scrambled egg', 'scrambled'], { prep: 'scrambled with milk and fat', src: SR }],
  ['egg-fried', 'Egg, fried', 'Eggs', [196, 13.6, 0.8, 14.8, 0], { large: 46, each: 46 }, 'large', ['fried egg', 'over easy egg', 'sunny side up egg', 'over medium egg'], { prep: 'fried' }],
  ['egg-omelet', 'Omelet, plain, 2 eggs', 'Eggs', [154, 10.6, 0.7, 11.7, 0], { each: 122, serving: 122 }, 'each', ['omelet', 'omelette', 'plain omelet'], { src: FNDDS, quality: 'Fillings not included; add them as separate items.' }],
  ['egg-white', 'Egg white', 'Eggs', [52, 10.9, 0.7, 0.2, 0], { large: 33, each: 33, cup: 243, tbsp: 15 }, 'large', ['egg white', 'liquid egg white'], {}],

  // Breakfast meats
  ['bacon', 'Bacon, pork, cooked', 'Pork', [541, 37, 1.4, 42, 0], { slice: 8, each: 8, piece: 8 }, 'slice', ['bacon', 'pork bacon', 'bacon strip'], { prep: 'pan-fried' }],
  ['bacon-turkey', 'Bacon, turkey, cooked', 'Turkey', [368, 29.4, 4.2, 25.9, 0], { slice: 10, each: 10, piece: 10 }, 'slice', ['turkey bacon'], { quality: 'Slice weight varies by brand.' }],
  ['sausage-pork', 'Sausage, pork breakfast, cooked', 'Pork', [325, 18.5, 1.4, 27, 0], { link: 23, patty: 27, each: 23, piece: 23 }, 'link', ['sausage', 'breakfast sausage', 'pork sausage', 'sausage link', 'sausage patty'], {}],
  ['sausage-chicken', 'Sausage, chicken, cooked', 'Chicken', [172, 16, 3, 10.5, 0], { link: 85, each: 85, piece: 85 }, 'link', ['chicken sausage'], { src: LABEL, quality: 'Brands vary widely.' }],

  // Chicken
  ['chicken-breast', 'Chicken breast, skinless, roasted or grilled', 'Chicken', [165, 31, 0, 3.6, 0], { breast: 170, each: 170, cup: 140, piece: 85 }, 'breast', ['chicken breast', 'grilled chicken breast', 'grilled chicken', 'baked chicken breast', 'roasted chicken breast', 'chicken breast meat', '~chicken'], { prep: 'roasted', quality: 'One breast assumed 6 oz cooked; sizes vary a lot.' }],
  ['chicken-thigh', 'Chicken thigh, skinless, roasted', 'Chicken', [209, 26, 0, 10.9, 0], { thigh: 52, each: 52, piece: 52 }, 'thigh', ['chicken thigh', 'grilled chicken thigh', 'baked chicken thigh'], {}],
  ['chicken-wing', 'Chicken wing, with skin, roasted', 'Chicken', [290, 26.9, 0, 19.5, 0], { wing: 34, each: 34, piece: 34 }, 'wing', ['chicken wing', 'wing', 'baked wing'], { quality: 'Sauced or fried wings run higher.' }],
  ['chicken-rotisserie', 'Chicken, rotisserie, meat and skin', 'Chicken', [239, 27, 0, 13.6, 0], { cup: 140, piece: 85 }, 'cup', ['rotisserie chicken', 'roast chicken'], {}],
  ['chicken-nuggets', 'Chicken nuggets, breaded', 'Chicken', [296, 15.3, 16.2, 19.1, 0.9], { piece: 16, each: 16 }, 'piece', ['chicken nugget', 'nugget'], { src: FNDDS }],

  // Beef
  ['beef-ground-85', 'Ground beef 85/15, cooked', 'Beef', [250, 25.9, 0, 15.6, 0], { patty: 85, cup: 140 }, 'oz', ['ground beef', '85 lean ground beef', 'hamburger patty', 'burger patty', 'beef patty', 'hamburger meat'], { prep: 'pan-browned' }],
  ['beef-ground-80', 'Ground beef 80/20, cooked', 'Beef', [272, 25.6, 0, 17.9, 0], { patty: 85, cup: 140 }, 'oz', ['80 20 ground beef', '80 lean ground beef'], { prep: 'pan-browned' }],
  ['beef-ground-93', 'Ground beef 93/7, cooked', 'Beef', [190, 26.5, 0, 8.6, 0], { patty: 85, cup: 140 }, 'oz', ['93 7 ground beef', 'lean ground beef', 'extra lean ground beef', '93 lean ground beef'], { prep: 'pan-browned' }],
  ['beef-sirloin', 'Sirloin steak, cooked', 'Beef', [243, 26.9, 0, 14.5, 0], { piece: 170 }, 'oz', ['sirloin', 'sirloin steak', 'top sirloin', '~steak', 'grilled steak'], { prep: 'broiled' }],
  ['beef-ribeye', 'Ribeye steak, cooked', 'Beef', [291, 23.9, 0, 21.8, 0], { piece: 227 }, 'oz', ['ribeye', 'rib eye', 'ribeye steak', 'rib eye steak'], { prep: 'broiled' }],
  ['beef-roast-deli', 'Roast beef, deli sliced', 'Deli meats', [115, 18.6, 0.6, 3.7, 0], { slice: 14, each: 14 }, 'slice', ['roast beef', 'deli roast beef'], { quality: 'Deli slice weight varies.' }],
  ['beef-jerky', 'Beef jerky', 'Snacks', [410, 33.2, 11, 25.6, 1.8], { piece: 20, bag: 85 }, 'oz', ['jerky', 'beef jerky'], {}],
  ['hot-dog', 'Hot dog, beef frank', 'Beef', [322, 11.7, 2, 30, 0], { each: 45, link: 45, piece: 45 }, 'each', ['hot dog', 'frank', 'frankfurter', 'beef frank'], { quality: 'Frank only; add the bun separately.' }],

  // Pork
  ['pork-chop', 'Pork chop, loin, cooked', 'Pork', [231, 25.7, 0, 13.5, 0], { chop: 120, each: 120, piece: 120 }, 'chop', ['pork chop'], { prep: 'broiled', quality: 'Chop size varies.' }],
  ['pork-tenderloin', 'Pork tenderloin, roasted', 'Pork', [143, 26.2, 0, 3.5, 0], { piece: 85 }, 'oz', ['pork tenderloin', 'pork loin', '~pork'], {}],
  ['ham-deli', 'Ham, deli sliced', 'Deli meats', [107, 16.9, 1, 3.7, 0], { slice: 14, each: 14 }, 'slice', ['ham', 'deli ham', 'sliced ham'], { quality: 'Deli slice weight varies.' }],
  ['salami', 'Salami', 'Deli meats', [336, 21.9, 2.4, 26, 0], { slice: 10, each: 10 }, 'slice', ['salami', 'genoa salami'], {}],
  ['pepperoni', 'Pepperoni', 'Deli meats', [504, 19.3, 1.2, 46.3, 0], { slice: 2, each: 2, piece: 2 }, 'slice', ['pepperoni'], {}],

  // Turkey
  ['turkey-deli', 'Turkey breast, deli sliced', 'Deli meats', [104, 17.1, 3.5, 1.7, 0], { slice: 14, each: 14 }, 'slice', ['turkey', 'deli turkey', 'sliced turkey', 'turkey lunch meat', 'turkey breast deli'], { quality: 'Deli slice weight varies.' }],
  ['turkey-roast', 'Turkey breast, roasted', 'Turkey', [147, 30.1, 0, 2.1, 0], { cup: 140, piece: 85 }, 'oz', ['roast turkey', 'roasted turkey', 'turkey breast'], {}],
  ['turkey-ground', 'Ground turkey 93/7, cooked', 'Turkey', [213, 27.1, 0, 11.6, 0], { patty: 85, cup: 140 }, 'oz', ['ground turkey', 'turkey burger', 'turkey patty'], {}],

  // Fish & seafood
  ['salmon-farmed', 'Salmon, Atlantic, farmed, cooked', 'Fish', [206, 22.1, 0, 12.4, 0], { fillet: 170, piece: 170 }, 'oz', ['salmon', 'baked salmon', 'grilled salmon', 'salmon fillet'], {}],
  ['salmon-wild', 'Salmon, wild, cooked', 'Fish', [182, 25.4, 0, 8.1, 0], { fillet: 154, piece: 154 }, 'oz', ['wild salmon', 'sockeye salmon', 'coho salmon'], {}],
  ['tuna-canned', 'Tuna, light, canned in water, drained', 'Fish', [116, 25.5, 0, 0.8, 0], { can: 113, cup: 154 }, 'can', ['tuna', 'canned tuna', 'tuna fish'], { quality: 'A 5 oz can drains to about 4 oz.' }],
  ['shrimp', 'Shrimp, cooked', 'Fish', [99, 24, 0.2, 0.3, 0], { large: 5.5, each: 5.5, piece: 5.5 }, 'oz', ['shrimp', 'prawn', 'grilled shrimp'], {}],
  ['tilapia', 'Tilapia, cooked', 'Fish', [128, 26.2, 0, 2.7, 0], { fillet: 87, piece: 87 }, 'fillet', ['tilapia'], {}],
  ['cod', 'Cod, cooked', 'Fish', [105, 22.8, 0, 0.9, 0], { fillet: 180, piece: 180 }, 'oz', ['cod', 'white fish', '~fish'], {}],

  // Grains & starches
  ['rice-white', 'Rice, white, cooked', 'Grains', [130, 2.7, 28.2, 0.3, 0.4], { cup: 158 }, 'cup', ['white rice', 'jasmine rice', 'basmati rice', 'steamed rice', '~rice'], {}],
  ['rice-brown', 'Rice, brown, cooked', 'Grains', [123, 2.7, 25.6, 1, 1.6], { cup: 195 }, 'cup', ['brown rice'], {}],
  ['pasta', 'Pasta, cooked', 'Grains', [158, 5.8, 30.9, 0.9, 1.8], { cup: 140 }, 'cup', ['pasta', 'spaghetti', 'penne', 'noodle', 'macaroni', 'linguine', 'fettuccine', 'rotini'], {}],
  ['pasta-ww', 'Pasta, whole wheat, cooked', 'Grains', [149, 6, 30, 1.7, 3.9], { cup: 140 }, 'cup', ['whole wheat pasta', 'whole wheat spaghetti', 'whole grain pasta'], {}],
  ['mac-cheese', 'Macaroni and cheese, boxed, prepared', 'Grains', [164, 6.4, 20.5, 6.6, 1], { cup: 198 }, 'cup', ['mac and cheese', 'macaroni and cheese', 'mac n cheese'], { src: FNDDS, quality: 'Homemade versions run higher.' }],
  ['quinoa', 'Quinoa, cooked', 'Grains', [120, 4.4, 21.3, 1.9, 2.8], { cup: 185 }, 'cup', ['quinoa'], {}],
  ['oatmeal', 'Oatmeal, cooked with water', 'Grains', [71, 2.5, 12, 1.5, 1.7], { cup: 234, packet: 177 }, 'cup', ['oatmeal', 'porridge', 'cooked oats'], {}],
  ['oats-dry', 'Oats, rolled, dry', 'Grains', [379, 13.2, 67.7, 6.5, 10.1], { cup: 81 }, 'cup', ['rolled oats', 'dry oats', 'old fashioned oats', 'quick oats', '~oats'], {}],
  ['bread-white', 'Bread, white', 'Bread', [266, 7.6, 49.4, 3.3, 2.7], { slice: 28, piece: 28, each: 28 }, 'slice', ['white bread', 'toast', 'white toast', 'sandwich bread', '~bread'], {}],
  ['bread-ww', 'Bread, whole wheat', 'Bread', [252, 12.4, 42.7, 3.5, 6, ], { slice: 32, piece: 32, each: 32 }, 'slice', ['whole wheat bread', 'wheat bread', 'whole wheat toast', 'wheat toast', 'whole grain bread'], {}],
  ['bread-sourdough', 'Bread, sourdough', 'Bread', [272, 10.8, 51.9, 2.4, 2.2], { slice: 32, piece: 32, each: 32 }, 'slice', ['sourdough', 'sourdough bread', 'sourdough toast'], { src: FNDDS }],
  ['bagel', 'Bagel, plain', 'Bread', [250, 10, 48.9, 1.5, 2.1], { each: 105, medium: 105, large: 131, small: 69, half: 52 }, 'each', ['bagel', 'plain bagel'], { quality: 'Bakery bagels are often 130 g or more.' }],
  ['english-muffin', 'English muffin', 'Bread', [227, 8.9, 44.2, 1.7, 3.5], { each: 57 }, 'each', ['english muffin'], {}],
  ['tortilla-flour', 'Tortilla, flour, 8 inch', 'Bread', [297, 7.9, 49.4, 7.4, 3.5], { each: 49, large: 70, small: 32 }, 'each', ['flour tortilla', '~tortilla', 'wrap'], {}],
  ['tortilla-corn', 'Tortilla, corn', 'Bread', [218, 5.7, 44.6, 2.9, 6.3], { each: 26 }, 'each', ['corn tortilla'], {}],
  ['bun', 'Hamburger or hot dog bun', 'Bread', [279, 9.5, 50, 3.9, 2], { each: 51 }, 'each', ['bun', 'hamburger bun', 'hot dog bun', 'burger bun'], {}],
  ['pita', 'Pita, white', 'Bread', [275, 9.1, 55.7, 1.2, 2.2], { each: 60 }, 'each', ['pita', 'pita bread'], {}],
  ['croissant', 'Croissant, butter', 'Bread', [406, 8.2, 45.8, 21, 2.6], { each: 57, medium: 57, large: 67 }, 'each', ['croissant'], {}],
  ['pancake', 'Pancake, plain, 4 inch', 'Breakfast', [227, 6.4, 28.3, 9.7, 0.8], { each: 38, large: 77 }, 'each', ['pancake', 'flapjack'], { quality: 'Toppings not included.' }],
  ['waffle', 'Waffle, frozen, toasted', 'Breakfast', [273, 6.6, 41, 9.2, 2.2], { each: 35 }, 'each', ['waffle', 'eggo'], {}],

  // Potatoes
  ['potato-baked', 'Potato, baked, flesh and skin', 'Potatoes', [93, 2.5, 21.2, 0.1, 2.2], { medium: 173, large: 299, small: 138, each: 173, cup: 122 }, 'medium', ['baked potato', 'potato', 'russet potato'], {}],
  ['potato-sweet', 'Sweet potato, baked', 'Potatoes', [90, 2, 20.7, 0.2, 3.3], { medium: 114, large: 180, small: 60, each: 114, cup: 200 }, 'medium', ['sweet potato', 'yam', 'baked sweet potato'], {}],
  ['potato-mashed', 'Mashed potatoes, with milk and butter', 'Potatoes', [113, 1.9, 16.8, 4.2, 1.5], { cup: 210 }, 'cup', ['mashed potato', 'mashed potatoes'], {}],
  ['fries', 'French fries', 'Potatoes', [312, 3.4, 41.4, 14.7, 3.8], { small: 71, medium: 117, large: 154, serving: 117 }, 'medium', ['fries', 'french fries', 'french fry'], { quality: 'Fast-food sizes vary by chain.' }],
  ['hash-browns', 'Hash browns', 'Potatoes', [265, 2.6, 35, 12.5, 3.2], { cup: 156, patty: 56 }, 'patty', ['hash brown', 'hashbrown', 'hash browns'], { src: FNDDS }],

  // Cereals
  ['cereal-oat-o', 'Toasted oat cereal (Cheerios-style)', 'Cereal', [367, 12.1, 73.2, 6.7, 10.4], { cup: 28 }, 'cup', ['cheerio', 'cheerios', 'oat cereal', 'toasted oat cereal'], { src: LABEL }],
  ['cereal-cornflakes', 'Corn flakes', 'Cereal', [357, 7.5, 84, 0.4, 3.3], { cup: 28 }, 'cup', ['corn flake', 'cornflake', 'corn flakes'], { src: LABEL }],
  ['cereal-raisin-bran', 'Raisin bran', 'Cereal', [321, 7.3, 79, 2.1, 11.3], { cup: 59 }, 'cup', ['raisin bran'], { src: LABEL }],
  ['granola', 'Granola', 'Cereal', [471, 10, 64, 20, 5], { cup: 122 }, 'cup', ['granola'], { quality: 'Brands vary widely.' }],

  // Vegetables
  ['broccoli-cooked', 'Broccoli, cooked', 'Vegetables', [35, 2.4, 7.2, 0.4, 3.3], { cup: 156 }, 'cup', ['broccoli', 'steamed broccoli', 'roasted broccoli', 'cooked broccoli'], {}],
  ['broccoli-raw', 'Broccoli, raw', 'Vegetables', [34, 2.8, 6.6, 0.4, 2.6], { cup: 91 }, 'cup', ['raw broccoli'], {}],
  ['spinach', 'Spinach, raw', 'Vegetables', [23, 2.9, 3.6, 0.4, 2.2], { cup: 30 }, 'cup', ['spinach', 'baby spinach'], {}],
  ['lettuce', 'Lettuce, romaine', 'Vegetables', [17, 1.2, 3.3, 0.3, 2.1], { cup: 47 }, 'cup', ['lettuce', 'romaine', 'salad greens', 'mixed greens', 'leafy greens'], {}],
  ['kale', 'Kale, raw', 'Vegetables', [35, 2.9, 4.4, 1.5, 4.1], { cup: 21 }, 'cup', ['kale'], {}],
  ['carrot', 'Carrot, raw', 'Vegetables', [41, 0.9, 9.6, 0.2, 2.8], { medium: 61, each: 61, large: 72, small: 50, cup: 128 }, 'medium', ['carrot', 'baby carrot'], {}],
  ['tomato', 'Tomato, raw', 'Vegetables', [18, 0.9, 3.9, 0.2, 1.2], { medium: 123, each: 123, large: 182, small: 91, slice: 20, cup: 180 }, 'medium', ['tomato', 'cherry tomato'], {}],
  ['cucumber', 'Cucumber, with peel', 'Vegetables', [15, 0.7, 3.6, 0.1, 0.5], { cup: 119, medium: 301, each: 301, slice: 7 }, 'cup', ['cucumber'], {}],
  ['onion', 'Onion, raw', 'Vegetables', [40, 1.1, 9.3, 0.1, 1.7], { medium: 110, each: 110, cup: 160, slice: 14 }, 'medium', ['onion', 'red onion', 'yellow onion'], {}],
  ['pepper-green', 'Bell pepper, green, raw', 'Vegetables', [20, 0.9, 4.6, 0.2, 1.7], { medium: 119, each: 119, cup: 149 }, 'medium', ['green pepper', 'green bell pepper', 'bell pepper'], {}],
  ['pepper-red', 'Bell pepper, red, raw', 'Vegetables', [31, 1, 6, 0.3, 2.1], { medium: 119, each: 119, cup: 149 }, 'medium', ['red pepper', 'red bell pepper', 'yellow pepper', 'orange pepper'], {}],
  ['green-beans', 'Green beans, cooked', 'Vegetables', [35, 1.9, 7.9, 0.3, 3.2], { cup: 125 }, 'cup', ['green bean', 'string bean'], {}],
  ['corn', 'Corn, sweet, cooked', 'Vegetables', [96, 3.4, 21, 1.5, 2.4], { ear: 90, cup: 149, each: 90 }, 'ear', ['corn', 'sweet corn', 'corn on the cob'], {}],
  ['peas', 'Peas, green, cooked', 'Vegetables', [84, 5.4, 15.6, 0.2, 5.5], { cup: 160 }, 'cup', ['peas', 'green peas', 'pea'], {}],
  ['mushrooms', 'Mushrooms, white, raw', 'Vegetables', [22, 3.1, 3.3, 0.3, 1], { cup: 70, each: 18 }, 'cup', ['mushroom'], {}],
  ['zucchini', 'Zucchini, raw', 'Vegetables', [17, 1.2, 3.1, 0.3, 1], { cup: 124, medium: 196, each: 196 }, 'cup', ['zucchini', 'summer squash'], {}],
  ['cauliflower', 'Cauliflower, raw', 'Vegetables', [25, 1.9, 5, 0.3, 2], { cup: 107 }, 'cup', ['cauliflower'], {}],
  ['asparagus', 'Asparagus, cooked', 'Vegetables', [22, 2.4, 4.1, 0.2, 2], { spear: 15, each: 15, cup: 180 }, 'spear', ['asparagus'], {}],
  ['celery', 'Celery, raw', 'Vegetables', [14, 0.7, 3, 0.2, 1.6], { stalk: 40, each: 40, cup: 101 }, 'stalk', ['celery'], {}],
  ['avocado', 'Avocado', 'Vegetables', [160, 2, 8.5, 14.7, 6.7], { each: 150, medium: 150, half: 75, cup: 150, slice: 15 }, 'each', ['avocado'], { quality: 'One Hass avocado assumed 150 g edible.' }],

  // Fruits
  ['banana', 'Banana', 'Fruit', [89, 1.1, 22.8, 0.3, 2.6], { medium: 118, each: 118, small: 101, large: 136, 'extra large': 152, cup: 150 }, 'medium', ['banana'], {}],
  ['apple', 'Apple, with skin', 'Fruit', [52, 0.3, 13.8, 0.2, 2.4], { medium: 182, each: 182, small: 149, large: 223, cup: 125 }, 'medium', ['apple'], {}],
  ['orange', 'Orange', 'Fruit', [47, 0.9, 11.8, 0.1, 2.4], { medium: 131, each: 131, large: 184, small: 96 }, 'medium', ['orange', 'navel orange'], {}],
  ['clementine', 'Clementine', 'Fruit', [47, 0.9, 12, 0.2, 1.7], { each: 74, medium: 74 }, 'each', ['clementine', 'mandarin', 'cutie', 'tangerine'], {}],
  ['strawberries', 'Strawberries', 'Fruit', [32, 0.7, 7.7, 0.3, 2], { cup: 152, each: 12, medium: 12, large: 18 }, 'cup', ['strawberry', 'strawberries'], {}],
  ['blueberries', 'Blueberries', 'Fruit', [57, 0.7, 14.5, 0.3, 2.4], { cup: 148 }, 'cup', ['blueberry', 'blueberries'], {}],
  ['raspberries', 'Raspberries', 'Fruit', [52, 1.2, 11.9, 0.7, 6.5], { cup: 123 }, 'cup', ['raspberry', 'raspberries'], {}],
  ['grapes', 'Grapes', 'Fruit', [69, 0.7, 18.1, 0.2, 0.9], { cup: 151, each: 5 }, 'cup', ['grape'], {}],
  ['pineapple', 'Pineapple', 'Fruit', [50, 0.5, 13.1, 0.1, 1.4], { cup: 165, slice: 84 }, 'cup', ['pineapple'], {}],
  ['watermelon', 'Watermelon', 'Fruit', [30, 0.6, 7.6, 0.2, 0.4], { cup: 152, wedge: 286, slice: 286 }, 'cup', ['watermelon'], {}],
  ['cantaloupe', 'Cantaloupe', 'Fruit', [34, 0.8, 8.2, 0.2, 0.9], { cup: 160, wedge: 69 }, 'cup', ['cantaloupe', 'melon'], {}],
  ['mango', 'Mango', 'Fruit', [60, 0.8, 15, 0.4, 1.6], { cup: 165, each: 200 }, 'cup', ['mango'], {}],
  ['peach', 'Peach', 'Fruit', [39, 0.9, 9.5, 0.3, 1.5], { medium: 150, each: 150 }, 'medium', ['peach', 'nectarine'], {}],
  ['pear', 'Pear', 'Fruit', [57, 0.4, 15.2, 0.1, 3.1], { medium: 178, each: 178 }, 'medium', ['pear'], {}],
  ['raisins', 'Raisins', 'Fruit', [299, 3.1, 79.2, 0.5, 3.7], { box: 43, cup: 145, tbsp: 9 }, 'box', ['raisin'], {}],
  ['applesauce', 'Applesauce, unsweetened', 'Fruit', [42, 0.2, 11.3, 0.1, 1.1], { cup: 244, container: 113 }, 'container', ['applesauce', 'apple sauce'], {}],

  // Beans & legumes
  ['beans-black', 'Black beans, cooked', 'Beans', [132, 8.9, 23.7, 0.5, 8.7], { cup: 172 }, 'cup', ['black bean', 'black beans', '~beans'], {}],
  ['beans-pinto', 'Pinto beans, cooked', 'Beans', [143, 9, 26.2, 0.7, 9], { cup: 171 }, 'cup', ['pinto bean', 'pinto beans'], {}],
  ['beans-kidney', 'Kidney beans, cooked', 'Beans', [127, 8.7, 22.8, 0.5, 6.4], { cup: 177 }, 'cup', ['kidney bean', 'red bean'], {}],
  ['chickpeas', 'Chickpeas, cooked', 'Beans', [164, 8.9, 27.4, 2.6, 7.6], { cup: 164 }, 'cup', ['chickpea', 'garbanzo', 'garbanzo bean'], {}],
  ['lentils', 'Lentils, cooked', 'Beans', [116, 9, 20.1, 0.4, 7.9], { cup: 198 }, 'cup', ['lentil'], {}],
  ['refried-beans', 'Refried beans, canned', 'Beans', [91, 5.5, 15.5, 1.2, 5.3], { cup: 252 }, 'cup', ['refried bean'], {}],
  ['hummus', 'Hummus', 'Beans', [166, 7.9, 14.3, 9.6, 6], { tbsp: 15, cup: 246 }, 'tbsp', ['hummus'], {}],
  ['tofu', 'Tofu, firm', 'Beans', [144, 17.3, 2.8, 8.7, 2.3], { cup: 252 }, 'oz', ['tofu', 'firm tofu'], {}],
  ['edamame', 'Edamame, shelled, cooked', 'Beans', [121, 11.9, 8.9, 5.2, 5.2], { cup: 155 }, 'cup', ['edamame'], {}],

  // Nuts & seeds
  ['almonds', 'Almonds', 'Nuts', [579, 21.2, 21.6, 49.9, 12.5], { handful: OZ, each: 1.2, cup: 143 }, 'oz', ['almond'], { quality: 'A handful is assumed to be 1 oz.' }],
  ['peanuts', 'Peanuts, dry roasted', 'Nuts', [585, 24.4, 21.3, 49.7, 8], { handful: OZ, cup: 146 }, 'oz', ['peanut'], { quality: 'A handful is assumed to be 1 oz.' }],
  ['cashews', 'Cashews, roasted', 'Nuts', [574, 15.3, 32.7, 46.4, 3], { handful: OZ, cup: 137 }, 'oz', ['cashew'], { quality: 'A handful is assumed to be 1 oz.' }],
  ['walnuts', 'Walnuts', 'Nuts', [654, 15.2, 13.7, 65.2, 6.7], { handful: OZ, cup: 117 }, 'oz', ['walnut'], { quality: 'A handful is assumed to be 1 oz.' }],
  ['pistachios', 'Pistachios, shelled', 'Nuts', [562, 20.2, 27.2, 45.3, 10.6], { handful: OZ, each: 0.6, cup: 123 }, 'oz', ['pistachio'], { quality: 'A handful is assumed to be 1 oz.' }],
  ['mixed-nuts', 'Mixed nuts, dry roasted', 'Nuts', [594, 17.3, 25.3, 51.5, 9], { handful: OZ, cup: 137 }, 'oz', ['mixed nut', '~nuts', '~nut'], { quality: 'A handful is assumed to be 1 oz.' }],
  ['trail-mix', 'Trail mix', 'Snacks', [462, 13.8, 44.9, 29.4, 5], { handful: OZ, cup: 150 }, 'oz', ['trail mix'], { quality: 'Mixes vary widely.' }],
  ['peanut-butter', 'Peanut butter', 'Nuts', [588, 25, 20, 50, 6], { tbsp: 16, tsp: 5.3 }, 'tbsp', ['peanut butter', 'pb'], {}],
  ['almond-butter', 'Almond butter', 'Nuts', [614, 21, 18.8, 55.5, 10.3], { tbsp: 16, tsp: 5.3 }, 'tbsp', ['almond butter'], {}],
  ['sunflower-seeds', 'Sunflower seeds, kernels', 'Nuts', [584, 20.8, 20, 51.5, 8.6], { handful: OZ, cup: 140, tbsp: 9 }, 'oz', ['sunflower seed'], {}],
  ['chia', 'Chia seeds', 'Nuts', [486, 16.5, 42.1, 30.7, 34.4], { tbsp: 12 }, 'tbsp', ['chia', 'chia seed'], {}],

  // Dairy
  ['milk-whole', 'Milk, whole', 'Dairy', [61, 3.2, 4.8, 3.3, 0], { cup: 244, glass: 244, 'fl oz': 30.5 }, 'cup', ['whole milk', 'vitamin d milk'], { liquid: true }],
  ['milk-2', 'Milk, 2% reduced fat', 'Dairy', [50, 3.3, 4.8, 2, 0], { cup: 244, glass: 244, 'fl oz': 30.5 }, 'cup', ['2 milk', '2% milk', 'reduced fat milk', '~milk'], { liquid: true }],
  ['milk-1', 'Milk, 1% low fat', 'Dairy', [42, 3.4, 5, 1, 0], { cup: 244, glass: 244, 'fl oz': 30.5 }, 'cup', ['1 milk', '1% milk', 'low fat milk', 'lowfat milk'], { liquid: true }],
  ['milk-skim', 'Milk, skim', 'Dairy', [34, 3.4, 5, 0.1, 0], { cup: 245, glass: 245, 'fl oz': 30.6 }, 'cup', ['skim milk', 'nonfat milk', 'fat free milk'], { liquid: true }],
  ['chocolate-milk', 'Chocolate milk, reduced fat', 'Dairy', [76, 3, 12, 1.9, 0.7], { cup: 250, glass: 250, 'fl oz': 31.3 }, 'cup', ['chocolate milk'], { liquid: true }],
  ['cheddar', 'Cheddar cheese', 'Dairy', [403, 22.9, 3.4, 33.1, 0], { slice: 28, cup: 113, tbsp: 7, stick: 28 }, 'oz', ['cheddar', 'cheddar cheese', 'shredded cheese', '~cheese'], {}],
  ['mozzarella', 'Mozzarella, part skim', 'Dairy', [254, 24.3, 2.8, 15.9, 0], { slice: 28, cup: 112, tbsp: 7 }, 'oz', ['mozzarella', 'mozzarella cheese'], {}],
  ['string-cheese', 'String cheese, part-skim mozzarella', 'Dairy', [254, 24.3, 2.8, 15.9, 0], { stick: 28, each: 28, piece: 28 }, 'stick', ['string cheese', 'cheese stick'], {}],
  ['american-cheese', 'American cheese, processed', 'Dairy', [371, 18.1, 4.8, 30.7, 0], { slice: 21, each: 21 }, 'slice', ['american cheese', 'cheese slice', 'kraft single'], {}],
  ['swiss', 'Swiss cheese', 'Dairy', [380, 26.9, 5.4, 27.8, 0], { slice: 28, each: 28 }, 'slice', ['swiss', 'swiss cheese'], {}],
  ['parmesan', 'Parmesan, grated', 'Dairy', [420, 28.4, 13.9, 27.8, 0], { tbsp: 5, cup: 100 }, 'tbsp', ['parmesan', 'parmesan cheese', 'parm'], {}],
  ['feta', 'Feta cheese', 'Dairy', [264, 14.2, 4.1, 21.3, 0], { cup: 150, tbsp: 9 }, 'oz', ['feta'], {}],
  ['cottage-2', 'Cottage cheese, 2%', 'Dairy', [81, 10.5, 4.8, 2.3, 0], { cup: 226, container: 113 }, 'cup', ['cottage cheese', 'low fat cottage cheese'], {}],
  ['cottage-4', 'Cottage cheese, 4%', 'Dairy', [98, 11.1, 3.4, 4.3, 0], { cup: 210, container: 113 }, 'cup', ['full fat cottage cheese', '4 cottage cheese'], {}],
  ['greek-nonfat', 'Greek yogurt, plain, nonfat', 'Dairy', [59, 10.2, 3.6, 0.4, 0], { container: 170, cup: 227 }, 'container', ['greek yogurt', 'nonfat greek yogurt', 'plain greek yogurt', '~yogurt'], {}],
  ['greek-whole', 'Greek yogurt, plain, whole milk', 'Dairy', [97, 9, 4, 5, 0], { container: 170, cup: 227 }, 'container', ['whole milk greek yogurt', 'full fat greek yogurt'], {}],
  ['yogurt-fruit', 'Yogurt, fruit flavored, low fat', 'Dairy', [99, 4, 19, 1.1, 0], { container: 170, cup: 245 }, 'container', ['fruit yogurt', 'flavored yogurt', 'strawberry yogurt', 'vanilla yogurt'], {}],
  ['butter', 'Butter', 'Dairy', [717, 0.9, 0.1, 81.1, 0], { tbsp: 14.2, tsp: 4.7, pat: 5 }, 'tbsp', ['butter', 'salted butter', 'unsalted butter'], {}],
  ['cream-cheese', 'Cream cheese', 'Dairy', [342, 5.9, 4.1, 34.2, 0], { tbsp: 14.5 }, 'tbsp', ['cream cheese'], {}],
  ['sour-cream', 'Sour cream', 'Dairy', [198, 2.4, 4.6, 19.4, 0], { tbsp: 12, cup: 230 }, 'tbsp', ['sour cream'], {}],
  ['heavy-cream', 'Heavy cream', 'Dairy', [340, 2.8, 2.7, 36, 0], { tbsp: 15, cup: 238, 'fl oz': 30 }, 'tbsp', ['heavy cream', 'whipping cream'], { liquid: true }],
  ['half-half', 'Half and half', 'Dairy', [131, 3.1, 4.3, 11.5, 0], { tbsp: 15, cup: 242, 'fl oz': 30 }, 'tbsp', ['half and half', 'half & half', 'half n half'], { liquid: true }],
  ['creamer', 'Coffee creamer, flavored', 'Dairy', [233, 0, 33, 10, 0], { tbsp: 15, 'fl oz': 30 }, 'tbsp', ['creamer', 'coffee creamer', 'coffee mate'], { liquid: true, src: LABEL }],
  ['ice-cream', 'Ice cream, vanilla', 'Dairy', [207, 3.5, 23.6, 11, 0.7], { cup: 132, scoop: 66 }, 'scoop', ['ice cream', 'vanilla ice cream'], { quality: 'One scoop assumed 1/2 cup.' }],

  // Milk alternatives
  ['almond-milk', 'Almond milk, unsweetened', 'Milk alternatives', [15, 0.6, 0.6, 1.2, 0.2], { cup: 240, glass: 240, 'fl oz': 30 }, 'cup', ['almond milk', 'unsweetened almond milk'], { liquid: true }],
  ['oat-milk', 'Oat milk', 'Milk alternatives', [48, 0.8, 5.1, 2.75, 0.8], { cup: 240, glass: 240, 'fl oz': 30 }, 'cup', ['oat milk', 'oatly'], { liquid: true, src: LABEL, quality: 'Brands vary.' }],
  ['soy-milk', 'Soy milk, unsweetened', 'Milk alternatives', [33, 2.9, 1.7, 1.6, 0.2], { cup: 243, glass: 243, 'fl oz': 30.4 }, 'cup', ['soy milk', 'soymilk'], { liquid: true }],

  // Oils
  ['olive-oil', 'Olive oil', 'Oils', [884, 0, 0, 100, 0], { tbsp: 13.5, tsp: 4.5 }, 'tbsp', ['olive oil', 'evoo', 'extra virgin olive oil', '~oil'], {}],
  ['vegetable-oil', 'Vegetable or canola oil', 'Oils', [884, 0, 0, 100, 0], { tbsp: 14, tsp: 4.7 }, 'tbsp', ['vegetable oil', 'canola oil', 'cooking oil', 'avocado oil'], {}],
  ['coconut-oil', 'Coconut oil', 'Oils', [892, 0, 0, 99, 0], { tbsp: 13.6, tsp: 4.5 }, 'tbsp', ['coconut oil'], {}],

  // Condiments
  ['ketchup', 'Ketchup', 'Condiments', [101, 1, 27.4, 0.1, 0.3], { tbsp: 17, tsp: 6, packet: 9 }, 'tbsp', ['ketchup', 'catsup'], {}],
  ['mustard', 'Mustard, yellow', 'Condiments', [60, 3.7, 5.8, 3.3, 4], { tsp: 5, tbsp: 15, packet: 5 }, 'tsp', ['mustard', 'yellow mustard', 'dijon'], {}],
  ['mayo', 'Mayonnaise', 'Condiments', [680, 1, 0.6, 74.9, 0], { tbsp: 13.8, tsp: 4.6 }, 'tbsp', ['mayo', 'mayonnaise'], {}],
  ['ranch', 'Ranch dressing', 'Condiments', [430, 1.3, 5.9, 44.5, 0.4], { tbsp: 15, serving: 30 }, 'tbsp', ['ranch', 'ranch dressing'], {}],
  ['bbq', 'Barbecue sauce', 'Condiments', [172, 0.8, 40.8, 0.6, 0.9], { tbsp: 17 }, 'tbsp', ['bbq sauce', 'barbecue sauce'], {}],
  ['soy-sauce', 'Soy sauce', 'Condiments', [53, 8.1, 4.9, 0.6, 0.8], { tbsp: 16, tsp: 5.3, packet: 9 }, 'tbsp', ['soy sauce'], { liquid: true }],
  ['salsa', 'Salsa', 'Condiments', [36, 1.5, 6.6, 0.2, 1.9], { tbsp: 16, cup: 259 }, 'tbsp', ['salsa', 'pico de gallo'], {}],
  ['guacamole', 'Guacamole', 'Condiments', [154, 2, 8.6, 13.6, 6.2], { tbsp: 15, cup: 230 }, 'tbsp', ['guacamole', 'guac'], { src: FNDDS }],
  ['honey', 'Honey', 'Condiments', [304, 0.3, 82.4, 0, 0.2], { tbsp: 21, tsp: 7 }, 'tbsp', ['honey'], {}],
  ['maple-syrup', 'Maple syrup', 'Condiments', [260, 0, 67, 0.1, 0], { tbsp: 20, cup: 315 }, 'tbsp', ['maple syrup', 'syrup', 'pancake syrup'], {}],
  ['sugar', 'Sugar, granulated', 'Condiments', [387, 0, 100, 0, 0], { tsp: 4.2, tbsp: 12.6, packet: 2.8, cup: 200 }, 'tsp', ['sugar', 'white sugar'], {}],
  ['jam', 'Jam or jelly', 'Condiments', [278, 0.4, 68.9, 0.1, 1.1], { tbsp: 20, tsp: 7, packet: 14 }, 'tbsp', ['jam', 'jelly', 'preserves'], {}],
  ['hot-sauce', 'Hot sauce', 'Condiments', [11, 0.5, 1.8, 0.4, 0.3], { tsp: 5, tbsp: 15 }, 'tsp', ['hot sauce', 'sriracha', 'tabasco', 'franks red hot'], {}],
  ['salt', 'Salt', 'Condiments', [0, 0, 0, 0, 0], { tsp: 6, pinch: 0.4 }, 'pinch', ['salt'], {}],
  ['black-pepper', 'Black pepper', 'Condiments', [251, 10.4, 64, 3.3, 25.3], { tsp: 2.3, pinch: 0.1 }, 'pinch', ['black pepper', 'ground pepper'], {}],

  // Protein products
  ['whey', 'Whey protein powder', 'Protein', [400, 80, 10, 5, 0], { scoop: 30 }, 'scoop', ['whey', 'whey protein', 'protein powder', 'whey isolate'], { src: LABEL, quality: 'Brand values differ; save your product as a custom food.' }],
  ['plant-protein', 'Plant protein powder', 'Protein', [364, 61, 15, 6, 6], { scoop: 33 }, 'scoop', ['plant protein', 'pea protein', 'vegan protein'], { src: LABEL, quality: 'Brand values differ.' }],
  ['protein-bar', 'Protein bar', 'Protein', [350, 33, 37, 12, 12], { bar: 60, each: 60 }, 'bar', ['protein bar', 'quest bar'], { src: LABEL, quality: 'Brand values differ widely.' }],
  ['protein-shake-rtd', 'Protein shake, ready to drink', 'Protein', [48, 9, 1.8, 1.1, 0.3], { bottle: 330, each: 330, 'fl oz': 30 }, 'bottle', ['premier protein', 'protein drink', 'ready to drink protein shake', 'fairlife protein shake'], { liquid: true, src: LABEL, quality: 'About 160 kcal and 30 g protein per 11 fl oz bottle.' }],

  // Beverages
  ['coffee', 'Coffee, brewed, black', 'Beverages', [1, 0.1, 0, 0, 0], { cup: 237, 'fl oz': 29.6, small: 355, medium: 473, large: 591 }, 'cup', ['coffee', 'black coffee', 'drip coffee', 'americano', 'espresso'], { liquid: true, quality: 'Coffee-shop sizes assumed 12, 16, and 20 fl oz.' }],
  ['tea', 'Tea, unsweetened', 'Beverages', [1, 0, 0.3, 0, 0], { cup: 237, 'fl oz': 29.6, small: 355, medium: 473, large: 591 }, 'cup', ['tea', 'unsweetened tea', 'green tea', 'black tea', 'iced tea'], { liquid: true }],
  ['sweet-tea', 'Sweet tea', 'Beverages', [37, 0, 9.2, 0, 0], { cup: 240, glass: 240, 'fl oz': 30, bottle: 500 }, 'cup', ['sweet tea', 'sweetened tea'], { liquid: true }],
  ['water', 'Water', 'Beverages', [0, 0, 0, 0, 0], { cup: 237, bottle: 500, 'fl oz': 29.6 }, 'cup', ['water', 'sparkling water', 'seltzer'], { liquid: true }],
  ['oj', 'Orange juice', 'Beverages', [45, 0.7, 10.4, 0.2, 0.2], { cup: 248, glass: 248, 'fl oz': 31 }, 'cup', ['orange juice', 'oj'], { liquid: true }],
  ['apple-juice', 'Apple juice', 'Beverages', [46, 0.1, 11.3, 0.1, 0.2], { cup: 248, glass: 248, 'fl oz': 31, box: 200 }, 'cup', ['apple juice', '~juice'], { liquid: true }],
  ['cola', 'Cola, regular', 'Beverages', [42, 0, 10.4, 0, 0], { can: 368, bottle: 610, 'fl oz': 30.7 }, 'can', ['cola', 'coke', 'pepsi', 'soda', 'pop', 'soft drink'], { liquid: true }],
  ['diet-soda', 'Diet soda', 'Beverages', [1, 0.1, 0.1, 0, 0], { can: 355, bottle: 591, 'fl oz': 29.6 }, 'can', ['diet soda', 'diet coke', 'coke zero', 'diet pepsi', 'zero sugar soda'], { liquid: true }],
  ['sports-drink', 'Sports drink', 'Beverages', [26, 0, 6.4, 0, 0], { bottle: 600, cup: 240, 'fl oz': 30 }, 'bottle', ['gatorade', 'sports drink', 'powerade'], { liquid: true }],
  ['beer', 'Beer, regular', 'Beverages', [43, 0.5, 3.6, 0, 0], { can: 356, bottle: 356, glass: 356, 'fl oz': 29.7 }, 'can', ['beer', 'lager', 'ale', 'ipa'], { liquid: true, quality: 'IPAs and craft beers can be much higher.' }],
  ['beer-light', 'Beer, light', 'Beverages', [29, 0.2, 1.6, 0, 0], { can: 356, bottle: 356, glass: 356, 'fl oz': 29.7 }, 'can', ['light beer', 'bud light', 'miller lite', 'coors light', 'michelob ultra'], { liquid: true }],
  ['wine-red', 'Wine, red', 'Beverages', [85, 0.1, 2.6, 0, 0], { glass: 147, 'fl oz': 29.4, bottle: 740 }, 'glass', ['red wine', '~wine', 'cabernet', 'merlot', 'pinot noir'], { liquid: true, quality: 'One glass assumed 5 fl oz.' }],
  ['wine-white', 'Wine, white', 'Beverages', [82, 0.1, 2.6, 0, 0], { glass: 147, 'fl oz': 29.4, bottle: 740 }, 'glass', ['white wine', 'chardonnay', 'sauvignon blanc', 'pinot grigio'], { liquid: true, quality: 'One glass assumed 5 fl oz.' }],
  ['spirits', 'Spirits, 80 proof', 'Beverages', [231, 0, 0, 0, 0], { shot: 42, 'fl oz': 27.8 }, 'shot', ['vodka', 'whiskey', 'whisky', 'bourbon', 'tequila', 'rum', 'gin', 'liquor'], { liquid: true }],

  // Snacks & sweets
  ['potato-chips', 'Potato chips', 'Snacks', [536, 7, 52.9, 34.6, 3.1], { handful: OZ, bag: OZ, cup: 20 }, 'oz', ['potato chip', 'chips', 'lays'], {}],
  ['tortilla-chips', 'Tortilla chips', 'Snacks', [489, 7.8, 66.4, 22.6, 5], { handful: OZ, each: 2.5, cup: 26 }, 'oz', ['tortilla chip', 'corn chip', 'nacho chip'], {}],
  ['pretzels', 'Pretzels, hard', 'Snacks', [380, 10.3, 79.8, 2.6, 2.9], { handful: OZ, each: 6 }, 'oz', ['pretzel'], {}],
  ['popcorn', 'Popcorn, air-popped', 'Snacks', [387, 12.9, 77.8, 4.5, 14.5], { cup: 8 }, 'cup', ['popcorn', 'air popped popcorn'], { quality: 'Movie-theater and buttered popcorn are much higher.' }],
  ['saltines', 'Saltine crackers', 'Snacks', [421, 9.5, 74, 8.6, 2.8], { each: 3, piece: 3 }, 'each', ['saltine', 'saltine cracker', '~cracker'], {}],
  ['rice-cake', 'Rice cake', 'Snacks', [387, 8.2, 81.5, 2.8, 4.2], { each: 9 }, 'each', ['rice cake'], {}],
  ['granola-bar', 'Granola bar, chewy', 'Snacks', [417, 6.2, 68, 14, 4.5], { bar: 24, each: 24 }, 'bar', ['granola bar', 'chewy bar', 'nature valley'], { src: LABEL }],
  ['dark-chocolate', 'Dark chocolate, 70-85%', 'Snacks', [598, 7.8, 45.9, 42.6, 10.9], { square: 10, bar: 101 }, 'oz', ['dark chocolate'], {}],
  ['milk-chocolate', 'Milk chocolate', 'Snacks', [535, 7.6, 59.4, 29.7, 3.4], { square: 10, bar: 44 }, 'bar', ['milk chocolate', 'chocolate bar', 'hershey bar', '~chocolate'], {}],
  ['cookie-cc', 'Chocolate chip cookie', 'Snacks', [488, 5.4, 64.3, 23.1, 2.4], { each: 16, medium: 16, large: 40 }, 'each', ['chocolate chip cookie', '~cookie'], { quality: 'Bakery cookies are often 2-4x this size.' }],
  ['pizza-cheese', 'Pizza, cheese, regular crust', 'Prepared', [266, 11.4, 33.3, 9.7, 2.3], { slice: 107 }, 'slice', ['cheese pizza', '~pizza', 'pizza slice'], { src: FNDDS, quality: 'Slice of a 14 inch pie; pizzerias vary.' }],
  ['pizza-pepperoni', 'Pizza, pepperoni, regular crust', 'Prepared', [276, 12, 30.1, 11.9, 2.5], { slice: 111 }, 'slice', ['pepperoni pizza'], { src: FNDDS, quality: 'Slice of a 14 inch pie; pizzerias vary.' }],
];

function build(r: Row): FoodDef {
  const [id, name, category, per, portions, defaultUnit, synonyms, opts = {}] = r;
  return {
    id,
    name,
    category,
    synonyms,
    basisAmount: 100,
    basisUnit: 'g',
    per: { calories: per[0], protein: per[1], carbs: per[2], fat: per[3], fiber: per[4] },
    portions,
    defaultUnit,
    liquid: opts.liquid,
    preparation: opts.prep,
    source: opts.src ?? SR,
    quality: opts.quality,
  };
}

export const FOODS: FoodDef[] = rows.map(build);
export const FOOD_BY_ID: Record<string, FoodDef> = Object.fromEntries(FOODS.map((f) => [f.id, f]));
export const DATASET_VERSION = '2026.10-1';
