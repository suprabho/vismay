import { NextResponse } from 'next/server'
import { deskHeatTable } from '@vismay/html-stories/randomizerApi'
import { SpinError } from '@vismay/randomizer/spins'
import { isAuthed } from '@/lib/adminAuth'

/** The Desk heat table for the slot machine's heat panel: heat, staleness, failed refreshes. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ subIndustries: await deskHeatTable() })
  } catch (e) {
    const status = e instanceof SpinError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status })
  }
}
