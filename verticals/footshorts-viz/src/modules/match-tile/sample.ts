import type { FixtureRow } from '../../types'
import type { MatchTileConfig } from './index'

export const sample: MatchTileConfig = {
  type: 'fs:match-tile',
  layout: 'single',
  fixture: {
    id: 'sample-arsenal-chelsea-tile',
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
    home: {
      id: 'arsenal',
      slug: 'arsenal',
      name: 'Arsenal',
      crest_url: null,
      primary_color: '#EF0107',
    },
    away: {
      id: 'chelsea',
      slug: 'chelsea',
      name: 'Chelsea',
      crest_url: null,
      primary_color: '#034694',
    },
  },
  competitionCrest: null,
}

function tile(
  id: string,
  home: [string, string, string],
  away: [string, string, string],
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
    home: { id: home[0], slug: home[0], name: home[1], crest_url: null, primary_color: home[2] },
    away: { id: away[0], slug: away[0], name: away[1], crest_url: null, primary_color: away[2] },
  }
}

export const sampleGrid: MatchTileConfig = {
  type: 'fs:match-tile',
  layout: 'grid',
  columns: 2,
  competitionCrest: null,
  fixtures: [
    tile('t1', ['arsenal', 'Arsenal', '#EF0107'], ['chelsea', 'Chelsea', '#034694'], 2, 1),
    tile('t2', ['liverpool', 'Liverpool', '#C8102E'], ['man-city', 'Man City', '#6CABDD'], 1, 1),
    tile('t3', ['tottenham', 'Tottenham', '#132257'], ['man-utd', 'Man Utd', '#DA291C'], 0, 3),
    tile('t4', ['newcastle', 'Newcastle', '#241F20'], ['aston-villa', 'Aston Villa', '#95BFE5'], 2, 2),
    tile('t5', ['brighton', 'Brighton', '#0057B8'], ['everton', 'Everton', '#003399'], 3, 0),
    tile('t6', ['west-ham', 'West Ham', '#7A263A'], ['fulham', 'Fulham', '#000000'], 1, 2),
  ],
}
