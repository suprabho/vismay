/**
 * Prompt builders for the Nashta planner's three AI calls. Kept as plain
 * string builders (not definePrompt) so the routes stay the single place that
 * chooses models and schemas.
 */
import type {
  MealPlanCombo,
  MealPlanPrefs,
  NashtaCandidateRecipe,
  NashtaMeal,
  NashtaRecipeDetail,
} from '@vismay/content-source/epics'

export const PARSE_PREFS_SYSTEM =
  'You extract hard constraints from a home cook\'s free-text meal instructions. ' +
  'Only mark a constraint when the text clearly states it — never invent one.'

export function buildParsePrefsPrompt(instructions: string): string {
  return `Instructions from the cook:\n"""\n${instructions.trim()}\n"""`
}

export const SUGGEST_SYSTEM =
  'You are Nashta, a thoughtful Indian home-cooking planner. You know Indian food ' +
  'traditions well — what pairs with what, regional combinations, realistic home-kitchen ' +
  'effort. You suggest meal combinations ONLY from the provided candidate list, copying ' +
  'recipe ids exactly. You respect every stated constraint, including implied ones (e.g. ' +
  '"no onion" rules out dishes that traditionally center on onion).'

/** Per-meal pairing guidance for the combo instruction. */
const MEAL_COMBO_GUIDE: Record<NashtaMeal, string> = {
  breakfast:
    "exactly one 'main', plus complementary 'side'/'condiment'/'drink' items that traditionally pair with it (e.g. idli → sambar + chutney + filter coffee)",
  lunch:
    "exactly one 'main' (a sabzi/curry/dal or one-pot rice), plus items that complete an Indian lunch — a 'side' (raita/salad/dry sabzi), a 'condiment' (chutney/pickle-style), optionally a 'drink' (chaas/lassi)",
  dinner:
    "exactly one 'main', plus complementary 'side'/'condiment' items for a satisfying dinner; a light 'dessert' or a 'drink' may round it off",
}

export function buildSuggestPrompt(input: {
  meal: NashtaMeal
  instructions: string
  prefs: MealPlanPrefs | null
  candidates: NashtaCandidateRecipe[]
  avoidTitles: string[]
  planDate: string
}): string {
  const lines = input.candidates
    .map((c) => `${c.id}|${c.title}|${c.course ?? '-'}|${c.diet ?? '-'}|${c.totalMin ?? '?'}min`)
    .join('\n')
  const avoid = input.avoidTitles.length
    ? `\nRecently cooked (prefer variety, avoid repeating these):\n${input.avoidTitles.map((t) => `- ${t}`).join('\n')}\n`
    : ''
  const prefs = input.prefs ? `\nParsed constraints: ${JSON.stringify(input.prefs)}\n` : ''
  const mustHave = input.prefs?.mustHave?.length
    ? `\nNON-NEGOTIABLE: every combo must include an item matching each of: ${input.prefs.mustHave.join(', ')} (matching candidates are in the list).\n`
    : ''
  return `Plan ${input.meal} for tomorrow (${input.planDate}).

Cook's instructions:
"""
${input.instructions.trim()}
"""
${prefs}${mustHave}${avoid}
Candidate recipes (id|title|course|diet|total time):
${lines}

Suggest exactly 3 distinct ${input.meal} combinations. Each combination:
- 2 to 4 items from the candidates: ${MEAL_COMBO_GUIDE[input.meal]}.
- The three combos should differ in character (e.g. one South Indian, one North Indian, one light/quick) while all honoring the constraints.
- Copy recipeId and title EXACTLY from the candidate lines — never invent a recipe.
- estTotalMin: realistic wall-clock time when sides cook in parallel; keep within any stated time budget.
- overnightPrep: if any dish needs soaking/fermenting/marinating/setting well before cooking (dosa or idli batter, dahi, soaked dal or rajma), say what to do ahead; otherwise null.`
}

export const SHOPPING_SYSTEM =
  'You are Nashta, an Indian home-cooking planner preparing a precise shopping list and video ' +
  'search queries. You merge ingredient lines faithfully — never drop an ingredient, never ' +
  'invent quantities beyond sensible scaling.'

export function buildShoppingPrompt(input: {
  meal: NashtaMeal
  combo: MealPlanCombo
  recipes: NashtaRecipeDetail[]
  prefs: MealPlanPrefs | null
  instructions: string
}): string {
  const household = input.prefs?.household ?? null
  const dishes = input.recipes
    .map((r) => {
      const native = r.titleNative ? `\n  native title: ${r.titleNative}` : ''
      return `- [${r.id}] ${r.title} (serves ${r.servings ?? '?'}, ${r.totalMin ?? '?'} min)${native}\n  ingredients: ${r.ingredientsRaw ?? '(missing)'}`
    })
    .join('\n')
  return `The cook chose this ${input.meal} combination for tomorrow: "${input.combo.title}".

Cook's original instructions (for household size and exclusions):
"""
${input.instructions.trim()}
"""
${household ? `Household: ${household}\n` : ''}
Dishes with their source ingredient lines:
${dishes}

Produce:
1. items — ONE merged shopping list for the whole combination:
   - Scale quantities from each recipe's servings to the household (default 2 adults when unstated). Keep amounts as natural kitchen text ("3/4 cup", "1 inch piece").
   - Merge the same ingredient across dishes into one line (sum quantities; note split use in forDishes).
   - category: produce | dairy | grains | spices | pantry | other.
   - staple: true for things an Indian kitchen almost certainly stocks (salt, turmeric, oil, mustard seeds …) so the cook can skim what actually needs buying.
   - Respect exclusions — if an excluded ingredient appears in a line, replace it with the customary substitute and say so in the item name (e.g. "hing (in place of onion)").
2. prepAhead — everything that must happen well before cooking (soaking, fermenting, marinating, setting curd), each as one short imperative line saying when ("tonight", "4 hours ahead"). Empty if none.
3. dishes — for EVERY dish id above, a hindiQuery for finding a Hindi-language recipe video on YouTube: when a native Devanagari title exists, use it plus "रेसिपी"; otherwise "<common dish name> recipe in hindi". Keep queries short.`
}
