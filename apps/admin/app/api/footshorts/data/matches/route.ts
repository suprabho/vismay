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
import { listEspnCupMatchOptions, listEspnCupMatchOptionsForTeam, parseEspnSeasonLabel } from '@/lib/espnCups'

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
 * ESPN cups (the private Cup fixtures import): a "2025/26" season label with a
 * cup slug lists that cup season's matches (ids are ESPN event ids; `facts` =
 * the ESPN match detail is extracted, `events` = its timeline count), and with
 * `&include=espn` the team scope adds the club's cup ties. Only the HTML-stories
 * brief asks for them: the compose brief cannot read those tables.
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
  const withCups = url.searchParams.get('include') === 'espn'
  try {
    if (team) {
      const [fixtures, cupRows] = await Promise.all([
        fetchFixturesForTeam(team),
        withCups ? listEspnCupMatchOptionsForTeam(team) : [],
      ])
      const coverage = await fetchMatchBriefCoverageForIds(fixtures.map((f) => f.id))
      return NextResponse.json({ ok: true, rows: [...(await rows(fixtures, coverage)), ...cupRows] })
    }
    if (competition && season && parseEspnSeasonLabel(season) != null) {
      return NextResponse.json({ ok: true, rows: await listEspnCupMatchOptions(competition, season) })
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
