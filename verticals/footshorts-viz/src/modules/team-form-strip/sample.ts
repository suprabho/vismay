import type { FixtureRow } from '../../types'
import type { TeamFormStripConfig } from './index'

const team = {
  id: 'middlesbrough',
  slug: 'middlesbrough',
  name: 'Middlesbrough',
  crest_url: null,
  primary_color: '#d2122e',
}

function opp(id: string, name: string) {
  return { id, slug: id, name, crest_url: null }
}

/** Build one finished fixture from Boro's perspective. `tg`/`og` = team/opp goals. */
function form(
  index: number,
  oppId: string,
  oppName: string,
  tg: number,
  og: number,
  isHome: boolean,
): FixtureRow {
  const other = opp(oppId, oppName)
  return {
    id: `boro-grid-${index}`,
    competition_slug: 'champ',
    season: '2025',
    matchday: 27 + index,
    stage: null,
    kickoff_at: `2026-02-${String(index + 1).padStart(2, '0')}T15:00:00Z`,
    status: 'finished',
    home_score: isHome ? tg : og,
    away_score: isHome ? og : tg,
    home_team_name: isHome ? team.name : oppName,
    away_team_name: isHome ? oppName : team.name,
    home: isHome ? team : other,
    away: isHome ? other : team,
  }
}

// Oldest → newest: a W-D-W-L-W run from Boro's perspective.
export const sample: TeamFormStripConfig = {
  type: 'fs:team-form-strip',
  teamId: 'middlesbrough',
  label: 'Form · last 5',
  layout: 'strip',
  fixtures: [
    {
      id: 'boro-form-1',
      competition_slug: 'champ',
      season: '2025',
      matchday: 38,
      stage: null,
      kickoff_at: '2026-04-05T14:00:00Z',
      status: 'finished',
      home_score: 2,
      away_score: 0,
      home_team_name: 'Middlesbrough',
      away_team_name: 'Leeds',
      home: team,
      away: opp('leeds', 'Leeds'),
    },
    {
      id: 'boro-form-2',
      competition_slug: 'champ',
      season: '2025',
      matchday: 39,
      stage: null,
      kickoff_at: '2026-04-12T14:00:00Z',
      status: 'finished',
      home_score: 1,
      away_score: 1,
      home_team_name: 'Sunderland',
      away_team_name: 'Middlesbrough',
      home: opp('sunderland', 'Sunderland'),
      away: team,
    },
    {
      id: 'boro-form-3',
      competition_slug: 'champ',
      season: '2025',
      matchday: 40,
      stage: null,
      kickoff_at: '2026-04-19T14:00:00Z',
      status: 'finished',
      home_score: 3,
      away_score: 1,
      home_team_name: 'Middlesbrough',
      away_team_name: 'Norwich',
      home: team,
      away: opp('norwich', 'Norwich'),
    },
    {
      id: 'boro-form-4',
      competition_slug: 'champ',
      season: '2025',
      matchday: 41,
      stage: null,
      kickoff_at: '2026-04-26T14:00:00Z',
      status: 'finished',
      home_score: 2,
      away_score: 1,
      home_team_name: 'Coventry',
      away_team_name: 'Middlesbrough',
      home: opp('coventry', 'Coventry'),
      away: team,
    },
    {
      id: 'boro-form-5',
      competition_slug: 'champ',
      season: '2025',
      matchday: 42,
      stage: null,
      kickoff_at: '2026-05-03T14:00:00Z',
      status: 'finished',
      home_score: 1,
      away_score: 0,
      home_team_name: 'Middlesbrough',
      away_team_name: 'Hull',
      home: team,
      away: opp('hull', 'Hull'),
    },
  ],
}

// A 5 × 3 grid of the last 15, with uniform 96px-wide cards. `rows` × `columns`
// caps the matrix; `cardWidth` makes every card identical regardless of name
// length (long opponent names truncate instead of widening their card).
export const sampleGrid: TeamFormStripConfig = {
  type: 'fs:team-form-strip',
  teamId: 'middlesbrough',
  label: 'Form · last 15',
  layout: 'grid',
  columns: 5,
  rows: 3,
  cardWidth: 96,
  fixtures: [
    form(1, 'leeds', 'Leeds', 2, 0, true),
    form(2, 'sunderland', 'Sunderland', 1, 1, false),
    form(3, 'norwich', 'Norwich City', 3, 1, true),
    form(4, 'coventry', 'Coventry City', 1, 2, false),
    form(5, 'hull', 'Hull', 1, 0, true),
    form(6, 'sheffield-wed', 'Sheffield Wednesday', 0, 0, false),
    form(7, 'preston', 'Preston North End', 2, 1, true),
    form(8, 'bristol-city', 'Bristol City', 1, 3, false),
    form(9, 'watford', 'Watford', 4, 0, true),
    form(10, 'qpr', 'Queens Park Rangers', 2, 2, false),
    form(11, 'swansea', 'Swansea City', 1, 0, true),
    form(12, 'cardiff', 'Cardiff City', 0, 1, false),
    form(13, 'millwall', 'Millwall', 3, 0, true),
    form(14, 'blackburn', 'Blackburn Rovers', 2, 1, false),
    form(15, 'stoke', 'Stoke City', 1, 1, true),
  ],
}
