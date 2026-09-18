import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { fetchFixtures } from '@vismay/content-source/footshortsData'
import type { CompetitionPhase } from '@vismay/content-source/footshortsBlocks'
import { listEspnCupFixtureRows } from '@/lib/espnCups'

/**
 * Fixtures for `?competition=<slug>&season=<season>` — DB-first with the same
 * guarded live fallback. Optional `&phase=knockout` / `&stage=QUARTER_FINALS`
 * narrow the slice (the picker uses `phase=knockout` to feed a clean bracket and
 * the full list to pick individual match cards). `&source=espn` serves the
 * private ESPN cup imports instead (admin_espn_cup_fixtures, season label
 * "2025/26") — admin-only data the studio can build cards from.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PHASES = new Set<CompetitionPhase>(['league', 'group', 'knockout'])

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const competition = url.searchParams.get('competition')?.trim()
  const season = url.searchParams.get('season')?.trim()
  if (!competition || !season) {
    return NextResponse.json({ error: 'missing "competition" or "season"' }, { status: 400 })
  }
  const phaseParam = url.searchParams.get('phase')?.trim()
  const phase = phaseParam && PHASES.has(phaseParam as CompetitionPhase)
    ? (phaseParam as CompetitionPhase)
    : undefined
  const stage = url.searchParams.get('stage')?.trim() || undefined
  const source = url.searchParams.get('source')?.trim()
  try {
    const rows = source === 'espn'
      ? await listEspnCupFixtureRows(competition, season)
      : await fetchFixtures({ competitionSlug: competition, season, phase, stage })
    return NextResponse.json({ ok: true, rows })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to fetch fixtures' },
      { status: 500 },
    )
  }
}
