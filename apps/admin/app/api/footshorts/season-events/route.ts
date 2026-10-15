import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listHistoryEvents, listHistorySeasons } from '@/lib/historicalEvents'
import { isSeasonLabel } from '@footshorts/shared/historicalEvents'

/**
 * Football-seasons book events for the Season events tab.
 * GET ?season=2003-04 → { seasons, season, events }   (no season: the newest one)
 * Admin-auth gated private data; responses are never cached.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const asked = new URL(req.url).searchParams.get('season')
  if (asked && !isSeasonLabel(asked)) return NextResponse.json({ error: 'Invalid season' }, { status: 400, headers: PRIVATE_HEADERS })
  try {
    const seasons = await listHistorySeasons()
    const season = asked ?? seasons[0] ?? null
    const events = season ? await listHistoryEvents(season) : []
    return NextResponse.json({ seasons, season, events }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load events' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}
