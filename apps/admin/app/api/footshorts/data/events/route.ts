import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { fetchFixtureEvents } from '@vismay/content-source/footshortsData'

/**
 * Match events (goals/cards/subs + minute) for `?fixtureId=<uuid>`, read from the
 * `fixture_events` table. Used by the Share Card studio's match-timeline card to
 * bake a fixture's events into the card config. Mirrors the sibling data routes'
 * auth gating + `{ ok, rows }` shape.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const fixtureId = url.searchParams.get('fixtureId')?.trim()
  if (!fixtureId) {
    return NextResponse.json({ error: 'missing "fixtureId"' }, { status: 400 })
  }
  try {
    const rows = await fetchFixtureEvents(fixtureId)
    return NextResponse.json({ ok: true, rows })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to fetch events' },
      { status: 500 },
    )
  }
}
