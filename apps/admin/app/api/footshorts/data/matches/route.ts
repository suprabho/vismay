import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  fetchCompetitionNames,
  fetchFixtures,
  fetchFixturesForTeam,
  fetchMatchBriefCoverage,
  fetchMatchBriefCoverageForIds,
  type MatchBriefCoverage,
} from '@vismay/content-source/footshortsData'
import type { FixtureRowInput } from '@vismay/content-source/footshortsBlocks'

/**
 * Fixtures ANNOTATED with what a match brief could actually carry for each one —
 * whether the Opta match centre has been scraped (`facts`), how many timeline
 * events exist (`events`), and how many Opta INSIGHTS cards were captured
 * (`insights`) — plus the competition each sits in.
 *
 * Two scopes:
 *   - `?competition=<slug>&season=<season>` — one competition's season.
 *   - `?team=<entity slug>` — one team's matches across every competition,
 *     newest first, so a brief can gather a club's league, cup and European
 *     games together.
 *
 * Feeds the match picker (compose Sources stage and the HTML-stories brief
 * generator), which badges every match so an editor doesn't brief a fixture
 * with no data behind it. The sibling `/fixtures` route stays the plain list
 * the canvas football picker uses.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function rows(fixtures: FixtureRowInput[], coverage: MatchBriefCoverage[]) {
  const by = new Map(coverage.map((c) => [c.fixtureId, c]))
  const names = await fetchCompetitionNames(fixtures.map((f) => f.competition_slug))
  return fixtures.map((f) => {
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
      competition: f.competition_slug,
      competitionName: names.get(f.competition_slug) ?? f.competition_slug,
      season: f.season,
      facts: c?.facts ?? false,
      events: c?.events ?? 0,
      insights: c?.insights ?? 0,
    }
  })
}

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const competition = url.searchParams.get('competition')?.trim()
  const season = url.searchParams.get('season')?.trim()
  const team = url.searchParams.get('team')?.trim()
  try {
    if (team) {
      const fixtures = await fetchFixturesForTeam(team)
      const coverage = await fetchMatchBriefCoverageForIds(fixtures.map((f) => f.id))
      return NextResponse.json({ ok: true, rows: await rows(fixtures, coverage) })
    }
    if (!competition || !season) {
      return NextResponse.json({ error: 'missing "competition" + "season", or "team"' }, { status: 400 })
    }
    const [fixtures, coverage] = await Promise.all([
      fetchFixtures({ competitionSlug: competition, season }),
      fetchMatchBriefCoverage(competition, season),
    ])
    return NextResponse.json({ ok: true, rows: await rows(fixtures, coverage) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to fetch matches' },
      { status: 500 },
    )
  }
}
