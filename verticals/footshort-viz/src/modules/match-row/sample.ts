import type { MatchRowConfig } from './index'

export const sample: MatchRowConfig = {
  type: 'fs:match-row',
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
