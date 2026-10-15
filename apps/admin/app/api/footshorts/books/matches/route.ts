import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { BOOK_COMPETITIONS } from '@/lib/seasonBooks/plan'
import { BookStoreError, listSeasonMatches } from '@/lib/seasonBooks/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

/**
 * `?season=2003&competition=Premier League` → that competition-season's
 * played matches from admin_historical_matches, compact. The planner computes
 * standings, runs and charts from them in the browser.
 */
export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const params = new URL(req.url).searchParams
  const season = Number(params.get('season'))
  const competition = params.get('competition') ?? ''
  if (!Number.isInteger(season) || season < 2002 || season > 2100 || !(BOOK_COMPETITIONS as readonly string[]).includes(competition)) {
    return NextResponse.json({ error: 'Invalid season or competition' }, { status: 400, headers: PRIVATE_HEADERS })
  }
  try {
    return NextResponse.json({ matches: await listSeasonMatches(season, competition) }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    const status = error instanceof BookStoreError ? error.status : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load matches' }, { status, headers: PRIVATE_HEADERS })
  }
}
