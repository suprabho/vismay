import { NextResponse } from 'next/server'
import { VIZNBA } from '@vismay/randomizer/datasets'
import { fetchNbaGames } from '@vismay/randomizer/spins'
import { isAuthed } from '@/lib/adminAuth'

/**
 * NBA games from ESPN's scoreboard for the HTML stories "Add games" picker
 * (components/html-stories/GameContextPicker): `?back=<days>&ahead=<days>`
 * around today (defaults 14 and 7, capped at 120 and 30), oldest first, with
 * team ids mapped onto the viznba_ ones. Admin-auth gated.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAY = 864e5

function days(v: string | null, fallback: number, max: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max) : fallback
}

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const back = days(url.searchParams.get('back'), 14, 120)
  const ahead = days(url.searchParams.get('ahead'), 7, 30)
  const now = Date.now()
  try {
    const games = await fetchNbaGames(now - back * DAY, now + ahead * DAY, new Map(VIZNBA.teams.map((t) => [t.espn_id, t.id])))
    return NextResponse.json({ games })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'ESPN scoreboard failed' }, { status: 502 })
  }
}
