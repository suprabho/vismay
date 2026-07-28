import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getFoodHistoryCoverage } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

// Aggregate coverage of the food-history corpus. A failure (e.g. migration
// 071 not applied) comes back as { error } rather than a 500.
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const coverage = await getFoodHistoryCoverage()
    return NextResponse.json({ coverage })
  } catch (e) {
    return NextResponse.json({ coverage: null, error: e instanceof Error ? e.message : 'failed' })
  }
}
