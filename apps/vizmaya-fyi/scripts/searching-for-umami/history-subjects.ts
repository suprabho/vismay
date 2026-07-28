/**
 * Curated subject registry for the food-history enrichment worker
 * (enrich-history.ts). The dish canon's raw ingredient strings (92 distinct
 * across dishes.json as of 2026-07-28) collapse here into canonical
 * ingredient SUBJECTS worth a history — variants merge (`turmeric powder` →
 * `turmeric`), generics are excluded (water, vegetable oil), and each subject
 * can override its Wikipedia article title when the name alone won't resolve.
 *
 * The worker warns on any raw dish ingredient that is neither matched nor
 * excluded, so when the dish canon grows this file's drift stays visible on
 * every run. `entityId` (food_ingredients.entity_id, CulinaryDB vocabulary)
 * is an optional future join hook — not needed for enrichment.
 */

export interface IngredientSubject {
  /** Canonical kebab slug — the food_history_subjects key. */
  slug: string
  /** Display name (also the default Wikipedia title guess). */
  name: string
  /** Raw dishes.json ingredient strings this subject absorbs (lowercase). */
  matches: string[]
  /** Wikipedia article title when the name isn't (close to) it. */
  wikiTitle?: string
  /** food_ingredients.entity_id when confidently matchable. */
  entityId?: number
}

export const INGREDIENT_SUBJECTS: IngredientSubject[] = [
  // ── Staples & sweeteners ─────────────────────────────────────────────────
  { slug: 'rice', name: 'Rice', matches: ['rice', 'basmati'] },
  { slug: 'wheat', name: 'Wheat', matches: ['wheat', 'flour', 'all purpose flour', 'whole wheat flour'] },
  { slug: 'maize', name: 'Maize', matches: ['cornstarch'] },
  { slug: 'sugar', name: 'Sugar', matches: ['sugar'] },
  { slug: 'salt', name: 'Salt', matches: ['salt'] },
  { slug: 'honey', name: 'Honey', matches: ['honey'] },

  // ── The spice trade ──────────────────────────────────────────────────────
  { slug: 'black-pepper', name: 'Black pepper', matches: ['pepper', 'pepper white'] },
  { slug: 'chili-pepper', name: 'Chili pepper', matches: ['green chile', 'green chilli', 'red chile', 'red chilli powder', 'chile powder'] },
  { slug: 'turmeric', name: 'Turmeric', matches: ['turmeric', 'turmeric powder'] },
  { slug: 'cardamom', name: 'Cardamom', matches: ['cardamom'] },
  { slug: 'cinnamon', name: 'Cinnamon', matches: ['cinnamon'] },
  { slug: 'clove', name: 'Clove', matches: ['clove'] },
  { slug: 'cumin', name: 'Cumin', matches: ['cumin', 'cumin powder'] },
  { slug: 'fenugreek', name: 'Fenugreek', matches: ['fenugreek'] },
  { slug: 'nutmeg', name: 'Nutmeg', matches: ['nutmeg'] },
  { slug: 'saffron', name: 'Saffron', matches: ['saffron'] },
  { slug: 'paprika', name: 'Paprika', matches: ['paprika'] },
  { slug: 'allspice', name: 'Allspice', matches: ['allspice'] },
  { slug: 'star-anise', name: 'Star anise', matches: ['anise star'], wikiTitle: 'Illicium verum' },
  { slug: 'five-spice-powder', name: 'Five-spice powder', matches: ['chinese five spice'] },
  { slug: 'garam-masala', name: 'Garam masala', matches: ['garam masala', 'garam masala powder'] },
  { slug: 'amchoor', name: 'Amchoor', matches: ['amchur'] },

  // ── Herbs & aromatics ────────────────────────────────────────────────────
  { slug: 'garlic', name: 'Garlic', matches: ['garlic'] },
  { slug: 'ginger', name: 'Ginger', matches: ['ginger'] },
  { slug: 'onion', name: 'Onion', matches: ['onion'] },
  { slug: 'coriander', name: 'Coriander', matches: ['cilantro'] },
  { slug: 'basil', name: 'Basil', matches: ['basil'] },
  { slug: 'lemongrass', name: 'Lemongrass', matches: ['lemongras'], wikiTitle: 'Cymbopogon' },
  { slug: 'curry-leaf', name: 'Curry tree', matches: ['curry leaf'], wikiTitle: 'Curry tree' },
  { slug: 'makrut-lime', name: 'Makrut lime', matches: ['kaffir lime'], wikiTitle: 'Citrus hystrix' },

  // ── Produce (Columbian exchange stars included) ──────────────────────────
  { slug: 'tomato', name: 'Tomato', matches: ['tomato', 'tomato paste'] },
  { slug: 'potato', name: 'Potato', matches: ['potato', 'potatoes'] },
  { slug: 'carrot', name: 'Carrot', matches: ['carrot'] },
  { slug: 'banana', name: 'Banana', matches: ['banana'] },
  { slug: 'lemon', name: 'Lemon', matches: ['lemon', 'lemon juice'] },
  { slug: 'lime', name: 'Lime', matches: ['lime'], wikiTitle: 'Lime (fruit)' },
  { slug: 'coconut', name: 'Coconut', matches: ['coconut milk'] },
  { slug: 'peanut', name: 'Peanut', matches: ['peanut', 'peanut oil'] },
  { slug: 'sesame', name: 'Sesame', matches: ['sesame', 'tahini'] },
  { slug: 'vanilla', name: 'Vanilla', matches: ['vanilla'] },

  // ── Ferments, condiments & fats ──────────────────────────────────────────
  { slug: 'soy-sauce', name: 'Soy sauce', matches: ['soy sauce'] },
  { slug: 'miso', name: 'Miso', matches: ['miso'] },
  { slug: 'hoisin-sauce', name: 'Hoisin sauce', matches: ['hoisin sauce'] },
  { slug: 'ketchup', name: 'Ketchup', matches: ['ketchup'] },
  { slug: 'vinegar', name: 'Vinegar', matches: ['vinegar'] },
  { slug: 'sake', name: 'Sake', matches: ['sake'] },
  { slug: 'yogurt', name: 'Yogurt', matches: ['yogurt', 'curd'] },
  { slug: 'ghee', name: 'Ghee', matches: ['ghee'] },
  { slug: 'butter', name: 'Butter', matches: ['butter'] },
  { slug: 'milk', name: 'Milk', matches: ['milk'] },
  { slug: 'mustard-oil', name: 'Mustard oil', matches: ['mustard oil'] },

  // ── Proteins with real domestication stories ─────────────────────────────
  { slug: 'chicken', name: 'Chicken', matches: ['chicken'] },
  { slug: 'pork', name: 'Pork', matches: ['pork'] },
]

/** Raw strings that are deliberately NOT subjects (generics, non-foods,
 *  dataset artifacts, or too weak a history to stand alone). */
export const EXCLUDED_INGREDIENTS = new Set([
  'water', 'cooking spray', 'bouillon', 'vegetable oil', 'sunflower',
  'sunflower oil', 'cream', 'cheese cream', 'bean', 'fish', 'prawn', 'duck',
  'lamb', 'mushroom', 'apple', 'orange', 'scallion', 'chive', 'parsley',
  'egg', 'rum',
])

/** Dish-slug → Wikipedia article title, for dishes whose name/slug won't
 *  resolve on its own (the worker's fallback search catches most others). */
export const DISH_WIKI_TITLES: Record<string, string> = {
  kare: 'Japanese curry',
  'kare-udon': 'Curry udon',
  zhengjiao: 'Jiaozi',
  'hamamatsu-gyoza': 'Gyoza',
  'jiao-yan-you-yu': 'Salt and pepper squid',
  'biangbiang-noodles': 'Biangbiang noodles',
  'roti-canai-thailand': 'Roti canai',
  'khao-niao-mamuang': 'Mango sticky rice',
  'phat-si-io': 'Pad see ew',
  'otoro-nigiri-sushi': 'Sushi',
  kaisendon: 'Donburi',
  'yokohama-style-ramen': 'Ramen',
  'sate-kambing': 'Satay',
  'nasi-goreng-ayam': 'Nasi goreng',
}
