import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getFoodRecipesByIds, getMealPlan, type NashtaRecipeDetail } from '@vismay/content-source/epics'
import PlanClient from './PlanClient'

export const dynamic = 'force-dynamic'

/** One Nashta plan: combo picker while 'suggested', the full plan (shopping
 *  list, videos, recipes) once finalized. */
export default async function NashtaPlanPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  if (!(await isAuthed())) redirect(`/login?next=/nashta/plan/${id}`)

  const plan = await getMealPlan(id).catch((e) => {
    console.error('nashta: failed to load plan', e)
    return null
  })
  if (!plan) notFound()

  // The recipe accordion needs full rows only after a combo is chosen.
  let recipes: NashtaRecipeDetail[] = []
  if (plan.status === 'finalized' && plan.selectedIndex != null) {
    const ids = plan.suggestions[plan.selectedIndex]?.items.map((i) => i.recipeId) ?? []
    try {
      const fetched = await getFoodRecipesByIds(ids)
      const byId = new Map(fetched.map((r) => [r.id, r]))
      recipes = ids.map((rid) => byId.get(rid)).filter((r): r is NashtaRecipeDetail => r != null)
    } catch (e) {
      console.error('nashta: failed to load combo recipes', e)
    }
  }

  return <PlanClient plan={plan} recipes={recipes} />
}
