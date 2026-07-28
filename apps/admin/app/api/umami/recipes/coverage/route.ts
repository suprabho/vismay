import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getFoodRecipeCoverage } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

const EPIC_SLUG = 'searching-for-umami'

// Aggregate coverage of the food recipe corpora + dish canon for the umami
// Recipes tab. A failure (e.g. migration 070 not applied) comes back as
// { error } rather than a 500, so the tab renders a notice instead of dying.
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const coverage = await getFoodRecipeCoverage(EPIC_SLUG)
    return NextResponse.json({ coverage })
  } catch (e) {
    return NextResponse.json({ coverage: null, error: e instanceof Error ? e.message : 'failed' })
  }
}
