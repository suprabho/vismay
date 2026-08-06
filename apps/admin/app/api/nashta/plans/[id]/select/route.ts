import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { generateStructured } from '@/lib/nashta/ai'
import {
  finalizeMealPlan,
  getFoodRecipesByIds,
  getMealPlan,
  type MealPlanDishVideos,
} from '@vismay/content-source/epics'
import { shoppingSchema } from '@/lib/nashta/schemas'
import { SHOPPING_SYSTEM, buildShoppingPrompt } from '@/lib/nashta/prompts'
import { findDishVideos } from '@/lib/nashta/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const SHOPPING_MODEL = 'text.claude'

// POST { comboIndex } → shopping list + Hindi YouTube videos for the chosen
// combo; flips the plan to 'finalized'.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  let body: { comboIndex?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const comboIndex = body.comboIndex
  if (typeof comboIndex !== 'number' || !Number.isInteger(comboIndex))
    return NextResponse.json({ error: 'comboIndex required' }, { status: 400 })

  try {
    const plan = await getMealPlan(id)
    if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const combo = plan.suggestions[comboIndex]
    if (!combo) return NextResponse.json({ error: 'comboIndex out of range' }, { status: 400 })
    // Re-selecting the same combo just replays the stored result.
    if (plan.status === 'finalized' && plan.selectedIndex === comboIndex)
      return NextResponse.json({ plan })

    const ids = combo.items.map((i) => i.recipeId)
    const fetched = await getFoodRecipesByIds(ids)
    const byId = new Map(fetched.map((r) => [r.id, r]))
    const recipes = ids.map((rid) => byId.get(rid)).filter((r) => r != null)
    if (recipes.length === 0)
      return NextResponse.json({ error: 'combo recipes missing from corpus' }, { status: 500 })

    const { result: shopping } = await generateStructured({
      model: SHOPPING_MODEL,
      system: SHOPPING_SYSTEM,
      prompt: buildShoppingPrompt({ combo, recipes, prefs: plan.prefs, instructions: plan.instructions }),
      schema: shoppingSchema,
      metadata: { feature: 'nashta-shopping' },
    })

    // Every dish gets a query even when the model skips one.
    const queryById = new Map(shopping.dishes.map((d) => [d.recipeId, d.hindiQuery]))
    const videos: MealPlanDishVideos[] = await Promise.all(
      combo.items.map(async (item) => {
        const recipe = byId.get(item.recipeId)
        const fallback = `${(recipe?.title ?? item.title).replace(/ recipe.*$/i, '')} recipe in hindi`
        const query = queryById.get(item.recipeId)?.trim() || fallback
        return {
          recipeId: item.recipeId,
          dishTitle: recipe?.title ?? item.title,
          query,
          videos: await findDishVideos(query),
        }
      })
    )

    const finalized = await finalizeMealPlan(id, {
      selectedIndex: comboIndex,
      shopping: { items: shopping.items, prepAhead: shopping.prepAhead },
      videos,
    })
    return NextResponse.json({ plan: finalized })
  } catch (e) {
    console.error('nashta select failed', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'select failed' }, { status: 500 })
  }
}
