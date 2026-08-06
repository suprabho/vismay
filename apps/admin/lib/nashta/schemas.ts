/**
 * Zod schemas for the Nashta planner's AI calls (structured output via
 * @vismay/ai-gateway generateText). The parsed shapes must stay assignable to
 * the persistence interfaces in @vismay/content-source/epics — the `_check`
 * assertions at the bottom fail the typecheck if they drift.
 */
import { z } from 'zod'
import type { MealPlanCombo, MealPlanPrefs, MealPlanShopping } from '@vismay/content-source/epics'

// ── Step 1a: parse the user's free-text instructions into hard filters ──────

export const prefsSchema = z.object({
  vegOnly: z
    .boolean()
    .nullable()
    .describe('true only when the instructions clearly ask for vegetarian-only; null when unstated'),
  maxTotalMin: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe('total cooking-time budget in minutes when stated (e.g. "30 min max"); null when unstated'),
  exclude: z
    .array(z.string())
    .describe('ingredients or dish styles to avoid, lowercased ("onion", "deep fried"); empty when none'),
  mustHave: z
    .array(z.string())
    .describe('specific dishes or drinks the cook explicitly demands ("masala chai", "poha"); empty when none'),
  household: z
    .string()
    .nullable()
    .describe('who is eating, verbatim-ish ("2 adults, 1 kid"); null when unstated'),
  notes: z
    .string()
    .nullable()
    .describe('any other constraint worth honoring (leftovers to use, cravings, occasion); null when none'),
})

// ── Step 1b: the three suggested combos ─────────────────────────────────────

export const comboItemSchema = z.object({
  recipeId: z.number().int().describe('id copied EXACTLY from the candidate list'),
  title: z.string().describe('the candidate line\'s title, copied as-is'),
  role: z.enum(['main', 'side', 'condiment', 'drink']),
})

export const comboSchema = z.object({
  title: z.string().describe('a short appetizing name for the combination, e.g. "South Indian classic"'),
  rationale: z.string().describe('one warm sentence on why this fits tomorrow morning'),
  items: z.array(comboItemSchema).min(1).max(4),
  estTotalMin: z
    .number()
    .int()
    .positive()
    .describe('realistic wall-clock minutes assuming sides cook in parallel'),
  effort: z.enum(['easy', 'medium', 'involved']),
  overnightPrep: z
    .string()
    .nullable()
    .describe('what must happen tonight (soak/ferment), or null when nothing'),
})

export const suggestionsSchema = z.object({
  combos: z.array(comboSchema).length(3),
})

// ── Step 2: shopping list + per-dish Hindi video queries ────────────────────

export const shoppingItemSchema = z.object({
  name: z.string(),
  quantity: z.string().describe('scaled amount as natural text, e.g. "1-1/2 cups" or "2 tbsp"'),
  category: z.enum(['produce', 'dairy', 'grains', 'spices', 'pantry', 'other']),
  staple: z.boolean().describe('true when an Indian kitchen almost certainly has it (salt, oil, turmeric …)'),
  forDishes: z.array(z.string()).describe('short dish names this item is used in'),
})

export const shoppingSchema = z.object({
  items: z.array(shoppingItemSchema),
  prepAhead: z
    .array(z.string())
    .describe('things to do tonight or early ("soak dal 4h", "set curd"); empty when none'),
  dishes: z.array(
    z.object({
      recipeId: z.number().int(),
      hindiQuery: z
        .string()
        .describe('YouTube search query for a Hindi recipe video of this dish — Devanagari when a native title exists, else "<dish> recipe in hindi"'),
    })
  ),
})

export type ParsedPrefs = z.infer<typeof prefsSchema>
export type SuggestedCombos = z.infer<typeof suggestionsSchema>
export type ShoppingResult = z.infer<typeof shoppingSchema>

// Compile-time drift guards against the content-source persistence shapes.
const _prefsCheck: MealPlanPrefs = {} as ParsedPrefs
const _comboCheck: MealPlanCombo = {} as z.infer<typeof comboSchema>
const _shoppingCheck: MealPlanShopping = {} as Omit<ShoppingResult, 'dishes'>
void _prefsCheck
void _comboCheck
void _shoppingCheck
