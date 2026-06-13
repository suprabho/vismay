import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listFootshortsCompetitions } from '@vismay/content-source/footshortsData'

/**
 * The (competition, season) pairs that have ingested standings/fixtures — feeds
 * the canvas "add football data" picker's dropdown. Read-only; the actual rows
 * come from the `standings` / `fixtures` sibling routes.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const competitions = await listFootshortsCompetitions()
    return NextResponse.json({ ok: true, competitions })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to list competitions' },
      { status: 500 },
    )
  }
}
