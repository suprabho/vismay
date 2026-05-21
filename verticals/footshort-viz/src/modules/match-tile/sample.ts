import type { MatchTileConfig } from './index'

export const sample: MatchTileConfig = {
  type: 'fs:match-tile',
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
