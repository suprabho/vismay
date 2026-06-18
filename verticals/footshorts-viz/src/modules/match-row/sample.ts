import type { FixtureRow } from '../../types'
import type { MatchRowConfig } from './index'

export const sample: MatchRowConfig = {
  type: 'fs:match-row',
  variant: 'compact',
  fixture: {
    id: 'sample-arsenal-chelsea',
    competition_slug: 'prem',
    season: '2025',
    matchday: 12,
    stage: null,
    kickoff_at: '2026-04-21T14:00:00Z',
    status: 'finished',
    home_score: 2,
    away_score: 1,
    home_team_name: 'Arsenal',
    away_team_name: 'Chelsea',
    home: { id: 'arsenal', slug: 'arsenal', name: 'Arsenal', crest_url: null },
    away: { id: 'chelsea', slug: 'chelsea', name: 'Chelsea', crest_url: null },
  },
}

/** One matchday's results as a single-column stack of rows. */
function fixture(
  id: string,
  home: [string, string],
  away: [string, string],
  homeScore: number,
  awayScore: number,
): FixtureRow {
  return {
    id,
    competition_slug: 'prem',
    season: '2025',
    matchday: 12,
    stage: null,
    kickoff_at: '2026-04-21T14:00:00Z',
    status: 'finished',
    home_score: homeScore,
    away_score: awayScore,
    home_team_name: home[1],
    away_team_name: away[1],
    home: { id: home[0], slug: home[0], name: home[1], crest_url: null },
    away: { id: away[0], slug: away[0], name: away[1], crest_url: null },
  }
}

export const sampleStack: MatchRowConfig = {
  type: 'fs:match-row',
  variant: 'compact',
  fixtures: [
    fixture('stack-ars-che', ['arsenal', 'Arsenal'], ['chelsea', 'Chelsea'], 2, 1),
    fixture('stack-liv-mci', ['liverpool', 'Liverpool'], ['man-city', 'Man City'], 1, 1),
    fixture('stack-tot-mun', ['tottenham', 'Tottenham'], ['man-utd', 'Man Utd'], 0, 3),
    fixture('stack-new-avl', ['newcastle', 'Newcastle'], ['aston-villa', 'Aston Villa'], 2, 2),
  ],
}
