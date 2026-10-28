import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listFootshortsCompetitions } from '@vismay/content-source/footshortsData'
import { listEspnCupCompetitions } from '@/lib/espnCups'

/**
 * The (competition, season) pairs that have ingested standings/fixtures — feeds
 * the canvas "add football data" picker's dropdown. Read-only; the actual rows
 * come from the `standings` / `fixtures` sibling routes. `?include=espn` adds
 * the private ESPN cup imports (season label "2025/26", `source: 'espn'`) for
 * the HTML-stories match picker; their matches come from `/matches`.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const withCups = new URL(req.url).searchParams.get('include') === 'espn'
  try {
    const [competitions, cups] = await Promise.all([
      listFootshortsCompetitions(),
      withCups ? listEspnCupCompetitions().catch(() => []) : [],
    ])
    if (!withCups) return NextResponse.json({ ok: true, competitions })
    const espn = cups.map((c) => ({ slug: c.slug, name: `${c.name} (ESPN)`, season: c.season, source: 'espn' as const }))
    return NextResponse.json({ ok: true, competitions: [...competitions, ...espn] })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to list competitions' },
      { status: 500 },
    )
  }
}
