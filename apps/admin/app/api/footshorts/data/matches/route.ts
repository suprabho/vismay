import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { fetchFixtures, fetchMatchBriefCoverage } from '@vismay/content-source/footshortsData'

/**
 * Fixtures for `?competition=<slug>&season=<season>` ANNOTATED with what a
 * match brief could actually carry for each one — whether the Opta match centre
 * has been scraped (`facts`), how many timeline events exist (`events`), and how
 * many Opta INSIGHTS cards were captured (`insights`).
 *
 * Feeds the compose Sources-stage "Add match" picker, which badges every match
 * so an editor doesn't brief a fixture with no data behind it. The sibling
 * `/fixtures` route stays the plain list the canvas football picker uses.
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
    const [fixtures, coverage] = await Promise.all([
      fetchFixtures({ competitionSlug: competition, season }),
      fetchMatchBriefCoverage(competition, season),
    ])
    const by = new Map(coverage.map((c) => [c.fixtureId, c]))
    const rows = fixtures.map((f) => {
      const c = by.get(f.id)
      return {
        id: f.id,
        home: f.home?.name ?? f.home_team_name ?? 'TBD',
        away: f.away?.name ?? f.away_team_name ?? 'TBD',
        kickoffAt: f.kickoff_at,
        status: f.status,
        homeScore: f.home_score,
        awayScore: f.away_score,
        matchday: f.matchday,
        stage: f.stage,
        facts: c?.facts ?? false,
        events: c?.events ?? 0,
        insights: c?.insights ?? 0,
      }
    })
    return NextResponse.json({ ok: true, rows })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to fetch matches' },
      { status: 500 },
    )
  }
}
