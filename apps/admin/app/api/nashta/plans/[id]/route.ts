import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getMealPlan } from '@vismay/content-source/epics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  try {
    const plan = await getMealPlan(id)
    if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ plan })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
