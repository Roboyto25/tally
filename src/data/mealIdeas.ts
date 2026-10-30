import type { MealCategory } from '../lib/types';

/**
 * Meal ideas for the recommendation engine. Each is a list of foods from foods.ts with
 * portions; nutrition is always computed from the database, never stored here.
 * The engine scales portions (0.75x–1.5x) to fit the remaining calorie budget.
 *
 * Bias: lean protein, unsaturated fats (fish, olive oil, nuts, avocado), and
 * soluble-fiber foods (oats, beans, lentils, fruit), in line with LDL-lowering
 * dietary patterns. Ideas are deliberately ordinary, quick meals.
 */
export interface MealIdea {
  id: string;
  name: string;
  meals: MealCategory[];
  items: [foodId: string, quantity: number, unit: string][];
}

export const MEAL_IDEAS: MealIdea[] = [
  // breakfast
  { id: 'oats-berries-walnuts', name: 'Oatmeal with blueberries and walnuts', meals: ['breakfast'], items: [['oats-dry', 0.5, 'cup'], ['milk-skim', 0.75, 'cup'], ['blueberries', 0.5, 'cup'], ['walnuts', 0.5, 'oz']] },
  { id: 'yogurt-raspberry-chia', name: 'Greek yogurt with raspberries, chia, and almonds', meals: ['breakfast', 'snack'], items: [['greek-nonfat', 1, 'container'], ['raspberries', 1, 'cup'], ['chia', 1, 'tbsp'], ['almonds', 0.5, 'oz']] },
  { id: 'eggwhite-scramble', name: 'Egg-white and spinach scramble on whole-wheat toast with avocado', meals: ['breakfast'], items: [['egg-white', 4, 'large'], ['spinach', 1, 'cup'], ['pepper-red', 0.5, 'medium'], ['bread-ww', 1, 'slice'], ['avocado', 0.25, 'each'], ['olive-oil', 1, 'tsp']] },
  { id: 'oat-cereal-banana', name: 'Toasted oat cereal with skim milk and a banana', meals: ['breakfast'], items: [['cereal-oat-o', 1.5, 'cup'], ['milk-skim', 1, 'cup'], ['banana', 1, 'medium']] },
  { id: 'pb-toast-apple', name: 'Whole-wheat toast with peanut butter and an apple', meals: ['breakfast', 'snack'], items: [['bread-ww', 1, 'slice'], ['peanut-butter', 1, 'tbsp'], ['apple', 1, 'medium']] },
  { id: 'cottage-pineapple', name: 'Cottage cheese with pineapple', meals: ['breakfast', 'snack'], items: [['cottage-2', 1, 'cup'], ['pineapple', 0.5, 'cup']] },
  { id: 'protein-oats', name: 'Protein oatmeal with banana', meals: ['breakfast'], items: [['oats-dry', 0.5, 'cup'], ['whey', 1, 'scoop'], ['banana', 0.5, 'medium'], ['milk-skim', 0.5, 'cup']] },

  // lunch and dinner
  { id: 'salmon-lentils-broccoli', name: 'Grilled salmon with lentils and broccoli', meals: ['lunch', 'dinner'], items: [['salmon-wild', 5, 'oz'], ['lentils', 0.75, 'cup'], ['broccoli-cooked', 1, 'cup'], ['olive-oil', 1, 'tsp']] },
  { id: 'chicken-brownrice-beans', name: 'Chicken breast with brown rice and green beans', meals: ['lunch', 'dinner'], items: [['chicken-breast', 5, 'oz'], ['rice-brown', 0.75, 'cup'], ['green-beans', 1, 'cup'], ['olive-oil', 1, 'tsp']] },
  { id: 'turkey-blackbean-bowl', name: 'Turkey and black bean bowl', meals: ['lunch', 'dinner'], items: [['turkey-ground', 4, 'oz'], ['beans-black', 0.75, 'cup'], ['rice-brown', 0.5, 'cup'], ['lettuce', 1, 'cup'], ['salsa', 2, 'tbsp'], ['avocado', 0.25, 'each']] },
  { id: 'tofu-stirfry', name: 'Tofu and edamame stir-fry with quinoa', meals: ['lunch', 'dinner'], items: [['tofu', 5, 'oz'], ['edamame', 0.5, 'cup'], ['broccoli-cooked', 1, 'cup'], ['pepper-red', 0.5, 'medium'], ['quinoa', 0.75, 'cup'], ['soy-sauce', 2, 'tsp'], ['vegetable-oil', 1, 'tsp']] },
  { id: 'shrimp-chickpea-salad', name: 'Shrimp, chickpea, and spinach salad', meals: ['lunch', 'dinner'], items: [['shrimp', 4, 'oz'], ['chickpeas', 0.5, 'cup'], ['spinach', 2, 'cup'], ['tomato', 1, 'medium'], ['cucumber', 0.5, 'cup'], ['olive-oil', 2, 'tsp']] },
  { id: 'cod-sweetpotato', name: 'Baked cod with sweet potato and asparagus', meals: ['dinner'], items: [['cod', 6, 'oz'], ['potato-sweet', 1, 'medium'], ['asparagus', 6, 'spear'], ['olive-oil', 1, 'tsp']] },
  { id: 'turkey-sandwich-apple', name: 'Turkey sandwich on whole wheat with an apple', meals: ['lunch'], items: [['turkey-deli', 4, 'slice'], ['bread-ww', 2, 'slice'], ['lettuce', 0.5, 'cup'], ['tomato', 2, 'slice'], ['mustard', 1, 'tsp'], ['apple', 1, 'medium']] },
  { id: 'tuna-chickpea', name: 'Tuna and chickpea salad', meals: ['lunch'], items: [['tuna-canned', 1, 'can'], ['chickpeas', 0.5, 'cup'], ['lettuce', 2, 'cup'], ['tomato', 1, 'medium'], ['olive-oil', 1, 'tsp']] },
  { id: 'blackbean-tacos', name: 'Black bean tacos with avocado and salsa', meals: ['lunch', 'dinner'], items: [['tortilla-corn', 3, 'each'], ['beans-black', 0.75, 'cup'], ['pepper-green', 0.5, 'medium'], ['lettuce', 1, 'cup'], ['salsa', 3, 'tbsp'], ['avocado', 0.25, 'each']] },
  { id: 'chicken-bean-chili', name: 'Chicken and kidney bean chili', meals: ['lunch', 'dinner'], items: [['chicken-breast', 4, 'oz'], ['beans-kidney', 0.75, 'cup'], ['tomato', 1, 'medium'], ['onion', 0.5, 'medium'], ['pepper-green', 0.5, 'medium'], ['olive-oil', 1, 'tsp']] },
  { id: 'wwpasta-chicken-broccoli', name: 'Whole-wheat pasta with chicken and broccoli', meals: ['lunch', 'dinner'], items: [['pasta-ww', 1, 'cup'], ['chicken-breast', 4, 'oz'], ['broccoli-cooked', 1, 'cup'], ['olive-oil', 2, 'tsp'], ['parmesan', 1, 'tbsp']] },
  { id: 'pork-potato-greenbeans', name: 'Pork tenderloin with baked potato and green beans', meals: ['dinner'], items: [['pork-tenderloin', 5, 'oz'], ['potato-baked', 1, 'small'], ['green-beans', 1, 'cup'], ['olive-oil', 1, 'tsp']] },
  { id: 'salmon-quinoa-salad', name: 'Salmon over quinoa and kale with olive oil', meals: ['lunch', 'dinner'], items: [['salmon-farmed', 4, 'oz'], ['quinoa', 0.75, 'cup'], ['kale', 2, 'cup'], ['olive-oil', 1, 'tsp']] },

  // snacks
  { id: 'apple-almonds', name: 'Apple with almonds', meals: ['snack'], items: [['apple', 1, 'medium'], ['almonds', 0.75, 'oz']] },
  { id: 'hummus-veg', name: 'Hummus with carrots and cucumber', meals: ['snack'], items: [['hummus', 3, 'tbsp'], ['carrot', 2, 'medium'], ['cucumber', 0.5, 'cup']] },
  { id: 'yogurt-blueberries', name: 'Greek yogurt with blueberries', meals: ['snack'], items: [['greek-nonfat', 1, 'container'], ['blueberries', 0.5, 'cup']] },
  { id: 'orange-walnuts', name: 'Orange and walnuts', meals: ['snack'], items: [['orange', 1, 'medium'], ['walnuts', 0.5, 'oz']] },
  { id: 'edamame-snack', name: 'Edamame', meals: ['snack'], items: [['edamame', 1, 'cup']] },
  { id: 'pear-stringcheese', name: 'Pear and string cheese', meals: ['snack'], items: [['pear', 1, 'medium'], ['string-cheese', 1, 'stick']] },
  { id: 'popcorn', name: 'Air-popped popcorn', meals: ['snack'], items: [['popcorn', 3, 'cup']] },
  { id: 'whey-shake', name: 'Whey shake with skim milk', meals: ['snack'], items: [['whey', 1, 'scoop'], ['milk-skim', 1, 'cup']] },
];
