import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { generateText } from '@vismay/ai-gateway'
import { generateStructured } from '@/lib/nashta/ai'
import {
  createMealPlan,
  listMealPlans,
  listNashtaCandidateRecipes,
  type MealPlanCombo,
  type MealPlanPrefs,
  type NashtaCandidateRecipe,
  type NashtaMeal,
} from '@vismay/content-source/epics'
import { prefsSchema, suggestionsSchema } from '@/lib/nashta/schemas'
import { PARSE_PREFS_SYSTEM, SUGGEST_SYSTEM, buildParsePrefsPrompt, buildSuggestPrompt } from '@/lib/nashta/prompts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const PARSE_MODEL = 'text.fast'
const SUGGEST_MODEL = 'text.claude'
const MAX_INSTRUCTIONS = 2000

/** Tomorrow's date for the kitchen, not the server — plans are IST mornings. */
function tomorrowInKolkata(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** Dish titles from recent plans' chosen combos for the SAME meal — the
 *  variety nudge (last week's dinners shouldn't veto breakfast poha). */
function recentDishTitles(plans: Awaited<ReturnType<typeof listMealPlans>>, meal: NashtaMeal): string[] {
  const titles: string[] = []
  for (const p of plans) {
    if (p.meal !== meal || p.status !== 'finalized' || p.selectedIndex == null) continue
    for (const item of p.suggestions[p.selectedIndex]?.items ?? []) titles.push(item.title)
  }
  return [...new Set(titles)].slice(0, 12)
}

/** Ground the AI's combos in the candidate pool: drop hallucinated ids, take
 *  titles from the pool rows. Returns null when a combo loses its shape. */
function groundCombos(
  combos: MealPlanCombo[],
  candidates: NashtaCandidateRecipe[]
): MealPlanCombo[] | null {
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const grounded: MealPlanCombo[] = []
  for (const combo of combos) {
    const items = combo.items
      .filter((i) => byId.has(i.recipeId))
      .map((i) => ({ ...i, title: byId.get(i.recipeId)!.title }))
    const seen = new Set<number>()
    const unique = items.filter((i) => (seen.has(i.recipeId) ? false : (seen.add(i.recipeId), true)))
    if (unique.length === 0 || !unique.some((i) => i.role === 'main')) return null
    grounded.push({ ...combo, items: unique })
  }
  return grounded.length === 3 ? grounded : null
}

const MEALS: NashtaMeal[] = ['breakfast', 'lunch', 'dinner']

// POST { instructions, meal?, planDate? } → parse prefs, pick candidates,
// suggest 3 combos, persist a 'suggested' plan.
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: { instructions?: unknown; meal?: unknown; planDate?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : ''
  if (!instructions) return NextResponse.json({ error: 'instructions required' }, { status: 400 })
  if (instructions.length > MAX_INSTRUCTIONS)
    return NextResponse.json({ error: `instructions over ${MAX_INSTRUCTIONS} chars` }, { status: 400 })
  const meal: NashtaMeal = MEALS.includes(body.meal as NashtaMeal) ? (body.meal as NashtaMeal) : 'breakfast'
  const planDate =
    typeof body.planDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.planDate)
      ? body.planDate
      : tomorrowInKolkata()

  try {
    // 1. Parse hard constraints (best-effort — a parse failure never blocks planning).
    let prefs: MealPlanPrefs | null = null
    try {
      const parsed = await generateText({
        model: PARSE_MODEL,
        system: PARSE_PREFS_SYSTEM,
        prompt: buildParsePrefsPrompt(instructions),
        schema: prefsSchema,
        metadata: { feature: 'nashta-prefs' },
      })
      prefs = parsed.result
    } catch (e) {
      console.warn(`nashta prefs parse failed: ${e instanceof Error ? e.message : e}`)
    }

    // 2. Candidate pool (relax the time filter rather than starve the model).
    let candidates = await listNashtaCandidateRecipes({
      meal,
      vegOnly: prefs?.vegOnly ?? undefined,
      maxTotalMin: prefs?.maxTotalMin ?? undefined,
    })
    if (candidates.length < 20 && prefs?.maxTotalMin) {
      candidates = await listNashtaCandidateRecipes({ meal, vegOnly: prefs?.vegOnly ?? undefined })
    }
    if (candidates.length < 5)
      return NextResponse.json({ error: 'not enough recipes match the constraints' }, { status: 422 })

    // Must-have dishes get pulled into the pool deterministically — the random
    // sample can't be trusted to contain "masala chai" on the one morning it
    // matters.
    for (const term of (prefs?.mustHave ?? []).slice(0, 3)) {
      try {
        const matches = await listNashtaCandidateRecipes({
          titleLike: term,
          vegOnly: prefs?.vegOnly ?? undefined,
          sample: 10,
        })
        const known = new Set(candidates.map((c) => c.id))
        candidates.push(...matches.filter((m) => !known.has(m.id)))
      } catch (e) {
        console.warn(`nashta must-have lookup failed for "${term}": ${e instanceof Error ? e.message : e}`)
      }
    }

    const avoidTitles = recentDishTitles(await listMealPlans(20), meal)

    // 3. Suggest, with one retry when grounding rejects the structure.
    const prompt = buildSuggestPrompt({ meal, instructions, prefs, candidates, avoidTitles, planDate })
    let combos: MealPlanCombo[] | null = null
    let modelUsed = SUGGEST_MODEL
    for (let attempt = 0; attempt < 2 && !combos; attempt++) {
      const res = await generateStructured({
        model: SUGGEST_MODEL,
        system: SUGGEST_SYSTEM,
        prompt,
        schema: suggestionsSchema,
        temperature: 0.8,
        metadata: { feature: 'nashta-suggest' },
      })
      modelUsed = res.modelUsed
      combos = groundCombos(res.result.combos, candidates)
    }
    if (!combos)
      return NextResponse.json({ error: 'the model could not build valid combos — try again' }, { status: 502 })

    const plan = await createMealPlan({ planDate, meal, instructions, prefs, suggestions: combos, model: modelUsed })
    return NextResponse.json({ plan })
  } catch (e) {
    console.error('nashta suggest failed', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'suggest failed' }, { status: 500 })
  }
}
