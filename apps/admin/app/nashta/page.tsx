import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listMealPlans, type MealPlan } from '@vismay/content-source/epics'
import NashtaClient from './NashtaClient'

export const dynamic = 'force-dynamic'

/**
 * Nashta — AI breakfast planner over the food_recipes corpus. Instructions →
 * three suggested combos → pick one → shopping list + Hindi YouTube videos →
 * downloadable HTML plan. See docs in the API routes under /api/nashta.
 */
export default async function NashtaPage() {
  if (!(await isAuthed())) redirect('/login?next=/nashta')

  // Degrade to an empty history rather than 500-ing when Supabase is missing.
  let plans: MealPlan[] = []
  try {
    plans = await listMealPlans(30)
  } catch (e) {
    console.error('nashta: failed to list plans', e)
  }

  return <NashtaClient initialPlans={plans} />
}
