import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { fetchStandings } from '@vismay/content-source/footshortsData'

/**
 * Standings rows for `?competition=<slug>&season=<season>` — DB-first, with a
 * live football-data.org fallback (returns [] when the table is empty and no
 * FOOTBALL_DATA_TOKEN is set). The picker wraps these via
 * `buildStandingsTableBlock`.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const competition = url.searchParams.get('competition')?.trim()
  const season = url.searchParams.get('season')?.trim()
  if (!competition || !season) {
    return NextResponse.json({ error: 'missing "competition" or "season"' }, { status: 400 })
  }
  try {
    const rows = await fetchStandings(competition, season)
    return NextResponse.json({ ok: true, rows })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to fetch standings' },
      { status: 500 },
    )
  }
}
