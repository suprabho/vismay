import type { FixtureRow, FixtureTeamRef } from '../../types'
import type { TeamCalendarConfig } from './index'

/**
 * Arsenal's October 2026: five Premier League games, two Champions League
 * league-phase nights and an EFL Cup tie — a mixed-competition month so the
 * chip, the home/away fill and the opponent crest all get exercised. The first
 * three are finished (W / L / D) so the score line shows too.
 */

const arsenal: FixtureTeamRef = {
  id: 'arsenal',
  slug: 'arsenal',
  name: 'Arsenal',
  crest_url: null,
  primary_color: '#EF0107',
}

function team(id: string, name: string): FixtureTeamRef {
  return { id, slug: id, name, crest_url: null }
}

function fixture(
  id: string,
  kickoff: string,
  competition: string,
  opponent: FixtureTeamRef,
  home: boolean,
  score?: [number, number],
): FixtureRow {
  const oppName = opponent?.name ?? 'TBD'
  return {
    id,
    competition_slug: competition,
    season: '26-27',
    matchday: null,
    stage: null,
    kickoff_at: kickoff,
    status: score ? 'finished' : 'scheduled',
    // `score` is [Arsenal, opponent]; map it onto home/away.
    home_score: score ? (home ? score[0] : score[1]) : null,
    away_score: score ? (home ? score[1] : score[0]) : null,
    home_team_name: home ? 'Arsenal' : oppName,
    away_team_name: home ? oppName : 'Arsenal',
    home: home ? arsenal : opponent,
    away: home ? opponent : arsenal,
  }
}

export const sample: TeamCalendarConfig = {
  type: 'fs:team-calendar',
  teamId: 'arsenal',
  month: '2026-10',
  label: 'Arsenal · October 2026',
  weekStart: 'mon',
  showScores: true,
  showLegend: true,
  fixtures: [
    // A September fixture — ignored by the October grid, proves the filter.
    fixture('ars-sep', '2026-09-27T15:30:00Z', 'premier-league', team('tottenham', 'Tottenham Hotspur'), true, [2, 0]),
    fixture('ars-1', '2026-10-03T14:00:00Z', 'premier-league', team('chelsea', 'Chelsea'), true, [2, 1]),
    fixture('ars-2', '2026-10-07T19:00:00Z', 'champions-league', team('bayern', 'Bayern Munich'), false, [1, 3]),
    fixture('ars-3', '2026-10-17T14:00:00Z', 'premier-league', team('liverpool', 'Liverpool'), false, [1, 1]),
    fixture('ars-4', '2026-10-21T19:00:00Z', 'champions-league', team('psg', 'Paris Saint-Germain'), true),
    fixture('ars-5', '2026-10-24T14:00:00Z', 'premier-league', team('brighton', 'Brighton & Hove Albion'), true),
    fixture('ars-6', '2026-10-28T19:45:00Z', 'efl-cup', team('leeds', 'Leeds United'), false),
    fixture('ars-7', '2026-10-31T15:00:00Z', 'premier-league', team('manchester-city', 'Manchester City'), false),
  ],
}
