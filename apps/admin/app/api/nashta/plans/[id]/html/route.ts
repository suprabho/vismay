import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getFoodRecipesByIds, getMealPlan } from '@vismay/content-source/epics'
import { renderPlanHtml } from '@/lib/nashta/renderPlanHtml'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Self-contained HTML of a finalized plan. Inline by default (print view);
// `?download=1` sets the attachment disposition.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  try {
    const plan = await getMealPlan(id)
    if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (plan.status !== 'finalized' || plan.selectedIndex == null)
      return NextResponse.json({ error: 'plan not finalized yet' }, { status: 409 })

    const combo = plan.suggestions[plan.selectedIndex]
    const ids = combo.items.map((i) => i.recipeId)
    const fetched = await getFoodRecipesByIds(ids)
    const byId = new Map(fetched.map((r) => [r.id, r]))
    const recipes = ids.map((rid) => byId.get(rid)).filter((r) => r != null)

    const html = renderPlanHtml(plan, recipes)
    const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' })
    if (new URL(req.url).searchParams.get('download') === '1')
      headers.set('Content-Disposition', `attachment; filename="nashta-${plan.planDate}.html"`)
    return new Response(html, { headers })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
