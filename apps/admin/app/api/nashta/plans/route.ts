import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listMealPlans } from '@vismay/content-source/epics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Recent plans for the /nashta history list.
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ plans: await listMealPlans(30) })
  } catch (e) {
    return NextResponse.json({ plans: [], error: e instanceof Error ? e.message : 'failed' })
  }
}
