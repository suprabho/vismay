import type { FixtureRow, StandingRow, TeamLane } from '@vismay/footshorts-viz/types'
import type { Storyboard, StoryboardLayerConfig } from './types'

// ---------------------------------------------------------------------------
// Hand-authored, narrative-consistent data. Shaped exactly like the footshorts
// Supabase rows (StandingRow / FixtureRow) and the fs:* layer configs, so each
// block is drop-in once a live data source is wired up. Season "25-26".
// ---------------------------------------------------------------------------

const MUN = '#DA291C'
const MCI = '#6CABDD'
const ARS = '#EF0107'
const LIV = '#C8102E'
const CHE = '#034694'
const TOT = '#132257'
const BHA = '#0057B8'
const NEW = '#241F20'
const BORO = '#d2122e'

// --- Premier League table (top six), Man United 3rd -------------------------

const standingsRows: StandingRow[] = [
  {
    competition_slug: 'prem', season: '25-26', team_id: 'arsenal', position: 1,
    played: 36, won: 26, draw: 6, lost: 4, goals_for: 80, goals_against: 28,
    goal_difference: 52, points: 84, form: 'WWWDW',
    team: { id: 'arsenal', slug: 'arsenal', name: 'Arsenal', crest_url: null },
  },
  {
    competition_slug: 'prem', season: '25-26', team_id: 'man-city', position: 2,
    played: 36, won: 25, draw: 6, lost: 5, goals_for: 82, goals_against: 34,
    goal_difference: 48, points: 81, form: 'WDWWW',
    team: { id: 'man-city', slug: 'man-city', name: 'Manchester City', crest_url: null },
  },
  {
    competition_slug: 'prem', season: '25-26', team_id: 'man-utd', position: 3,
    played: 36, won: 23, draw: 8, lost: 5, goals_for: 70, goals_against: 38,
    goal_difference: 32, points: 77, form: 'WWWWW',
    team: { id: 'man-utd', slug: 'man-utd', name: 'Manchester United', crest_url: null },
  },
  {
    competition_slug: 'prem', season: '25-26', team_id: 'liverpool', position: 4,
    played: 36, won: 22, draw: 8, lost: 6, goals_for: 74, goals_against: 40,
    goal_difference: 34, points: 74, form: 'WLWDW',
    team: { id: 'liverpool', slug: 'liverpool', name: 'Liverpool', crest_url: null },
  },
  {
    competition_slug: 'prem', season: '25-26', team_id: 'chelsea', position: 5,
    played: 36, won: 21, draw: 7, lost: 8, goals_for: 66, goals_against: 42,
    goal_difference: 24, points: 70, form: 'WDLWW',
    team: { id: 'chelsea', slug: 'chelsea', name: 'Chelsea', crest_url: null },
  },
  {
    competition_slug: 'prem', season: '25-26', team_id: 'tottenham', position: 6,
    played: 36, won: 19, draw: 8, lost: 9, goals_for: 68, goals_against: 48,
    goal_difference: 20, points: 65, form: 'LWDWW',
    team: { id: 'tottenham', slug: 'tottenham', name: 'Tottenham', crest_url: null },
  },
]

// --- Position over matchdays — United climb from 6th to 3rd -----------------
// Carrick takes interim charge around MD14; the red line bends upward after.

const mdSeries = (positions: number[]): { matchday: number; position: number }[] =>
  positions.map((position, i) => ({ matchday: i + 1, position }))

const lanes: TeamLane[] = [
  {
    team_id: 'arsenal', team_name: 'Arsenal', team_code: 'ARS', color: ARS,
    points: mdSeries([
      1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]),
  },
  {
    team_id: 'man-city', team_name: 'Manchester City', team_code: 'MCI', color: MCI,
    points: mdSeries([
      3, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
      2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    ]),
  },
  {
    team_id: 'man-utd', team_name: 'Manchester United', team_code: 'MUN', color: MUN,
    points: mdSeries([
      6, 7, 7, 8, 6, 6, 7, 6, 6, 6, 6, 7, 6, 6, 5, 5, 5, 4, 4,
      4, 4, 4, 3, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
    ]),
  },
  {
    team_id: 'liverpool', team_name: 'Liverpool', team_code: 'LIV', color: LIV,
    points: mdSeries([
      2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
      3, 3, 3, 4, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
    ]),
  },
  {
    team_id: 'chelsea', team_name: 'Chelsea', team_code: 'CHE', color: CHE,
    points: mdSeries([
      5, 4, 4, 4, 4, 5, 4, 5, 4, 4, 5, 4, 4, 4, 4, 4, 4, 5, 5,
      5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
    ]),
  },
]

// --- Individual fixtures ----------------------------------------------------

const team = (id: string, name: string, color: string) => ({
  id, slug: id, name, crest_url: null, primary_color: color,
})

const munCityCard: StoryboardLayerConfig = {
  type: 'fs:match-card',
  layout: 'horizontal',
  home: 'Manchester United',
  away: 'Manchester City',
  score: '2 – 1',
  kickoff: 'FT',
  competition: 'Premier League · matchday 28',
  competitionSlug: 'prem',
  homeColor: MUN,
  awayColor: MCI,
  dateLabel: 'Sunday, Mar 8',
}

const munLiverpoolTile: StoryboardLayerConfig = {
  type: 'fs:match-tile',
  fixture: {
    id: 'mun-liv-md31',
    competition_slug: 'prem',
    season: '25-26',
    matchday: 31,
    stage: null,
    kickoff_at: '2026-04-05T15:30:00Z',
    status: 'finished',
    home_score: 2,
    away_score: 0,
    home_team_name: 'Manchester United',
    away_team_name: 'Liverpool',
    home: team('man-utd', 'Manchester United', MUN),
    away: team('liverpool', 'Liverpool', LIV),
  } satisfies FixtureRow,
  competitionCrest: null,
}

const munChelseaRow: StoryboardLayerConfig = {
  type: 'fs:match-row',
  variant: 'compact',
  fixture: {
    id: 'mun-che-md34',
    competition_slug: 'prem',
    season: '25-26',
    matchday: 34,
    stage: null,
    kickoff_at: '2026-04-26T13:00:00Z',
    status: 'finished',
    home_score: 3,
    away_score: 1,
    home_team_name: 'Manchester United',
    away_team_name: 'Chelsea',
    home: { id: 'man-utd', slug: 'man-utd', name: 'Manchester United', crest_url: null },
    away: { id: 'chelsea', slug: 'chelsea', name: 'Chelsea', crest_url: null },
  } satisfies FixtureRow,
}

// --- FA Cup knockout run ----------------------------------------------------

const cupFixture = (
  id: string,
  stage: string,
  kickoff: string,
  status: FixtureRow['status'],
  home: { id: string; name: string; color: string },
  away: { id: string; name: string; color: string },
  homeScore: number | null,
  awayScore: number | null,
): FixtureRow => ({
  id,
  competition_slug: 'fa-cup',
  season: '2026',
  matchday: null,
  stage,
  phase: 'knockout',
  kickoff_at: kickoff,
  status,
  home_score: homeScore,
  away_score: awayScore,
  home_team_name: home.name,
  away_team_name: away.name,
  home: { id: home.id, slug: home.id, name: home.name, crest_url: null, primary_color: home.color },
  away: { id: away.id, slug: away.id, name: away.name, crest_url: null, primary_color: away.color },
})

const faCupBracket: StoryboardLayerConfig = {
  type: 'fs:bracket',
  fixtures: [
    cupFixture(
      'fac-qf', 'quarter-final', '2026-03-21T17:45:00Z', 'finished',
      { id: 'man-utd', name: 'Manchester United', color: MUN },
      { id: 'brighton', name: 'Brighton', color: BHA },
      2, 0,
    ),
    cupFixture(
      'fac-sf', 'semi-final', '2026-04-19T15:30:00Z', 'finished',
      { id: 'man-utd', name: 'Manchester United', color: MUN },
      { id: 'newcastle', name: 'Newcastle', color: NEW },
      1, 0,
    ),
    cupFixture(
      'fac-final', 'final', '2026-05-16T16:30:00Z', 'scheduled',
      { id: 'man-utd', name: 'Manchester United', color: MUN },
      { id: 'man-city', name: 'Manchester City', color: MCI },
      null, null,
    ),
  ],
}

// --- Tactics board phases (authored from the three Wyscout images) ----------

type P = { id: string; x: number; y: number; team: 'home' | 'away'; label?: string }
const frame = (t: number, ball: [number, number], players: P[]) => ({
  t,
  ball: { x: ball[0], y: ball[1] },
  players,
})
// Opponent dots — unobtrusive (no labels).
const opp = (id: string, x: number, y: number): P => ({ id, x, y, team: 'away', label: '' })

// Phase 1 — short-passing build-up & central overload (Boro in red).
const buildUpPhase = {
  phaseId: 'carrick-buildup',
  formation: '4-2-3-1',
  durationSec: 4,
  frames: [
    frame(0, [18, 50], [
      { id: 'GK', x: 8, y: 50, team: 'home', label: 'GK' },
      { id: 'Dijksteel', x: 22, y: 82, team: 'home', label: 'Dijksteel' },
      { id: 'Fry', x: 18, y: 62, team: 'home', label: 'Fry' },
      { id: 'Edmundson', x: 18, y: 38, team: 'home', label: 'Edmundson' },
      { id: 'Borges', x: 22, y: 18, team: 'home', label: 'Borges' },
      { id: 'Hackney', x: 34, y: 58, team: 'home', label: 'Hackney' },
      { id: 'Morris', x: 34, y: 42, team: 'home', label: 'Morris' },
      { id: 'Azaz', x: 50, y: 50, team: 'home', label: 'Azaz' },
      { id: 'Forss', x: 62, y: 82, team: 'home', label: 'Forss' },
      { id: 'Whittaker', x: 58, y: 20, team: 'home', label: 'Whittaker' },
      { id: 'Conway', x: 68, y: 50, team: 'home', label: 'Conway' },
      opp('o1', 60, 45), opp('o2', 60, 55), opp('o3', 52, 50), opp('o4', 44, 64),
      opp('o5', 44, 36), opp('o6', 32, 78), opp('o7', 28, 56), opp('o8', 28, 44), opp('o9', 32, 22),
    ]),
    frame(2, [34, 56], [
      { id: 'GK', x: 10, y: 50, team: 'home', label: 'GK' },
      { id: 'Dijksteel', x: 38, y: 86, team: 'home', label: 'Dijksteel' },
      { id: 'Fry', x: 24, y: 62, team: 'home', label: 'Fry' },
      { id: 'Edmundson', x: 24, y: 40, team: 'home', label: 'Edmundson' },
      { id: 'Borges', x: 34, y: 16, team: 'home', label: 'Borges' },
      { id: 'Hackney', x: 40, y: 56, team: 'home', label: 'Hackney' },
      { id: 'Morris', x: 42, y: 44, team: 'home', label: 'Morris' },
      { id: 'Azaz', x: 52, y: 50, team: 'home', label: 'Azaz' },
      { id: 'Forss', x: 66, y: 84, team: 'home', label: 'Forss' },
      { id: 'Whittaker', x: 54, y: 26, team: 'home', label: 'Whittaker' },
      { id: 'Conway', x: 72, y: 48, team: 'home', label: 'Conway' },
      opp('o1', 56, 46), opp('o2', 56, 54), opp('o3', 50, 50), opp('o4', 46, 62),
      opp('o5', 46, 38), opp('o6', 36, 78), opp('o7', 32, 56), opp('o8', 32, 44), opp('o9', 36, 22),
    ]),
    frame(4, [55, 50], [
      { id: 'GK', x: 12, y: 50, team: 'home', label: 'GK' },
      { id: 'Dijksteel', x: 50, y: 88, team: 'home', label: 'Dijksteel' },
      { id: 'Fry', x: 30, y: 62, team: 'home', label: 'Fry' },
      { id: 'Edmundson', x: 30, y: 40, team: 'home', label: 'Edmundson' },
      { id: 'Borges', x: 44, y: 14, team: 'home', label: 'Borges' },
      { id: 'Hackney', x: 46, y: 54, team: 'home', label: 'Hackney' },
      { id: 'Morris', x: 50, y: 46, team: 'home', label: 'Morris' },
      { id: 'Azaz', x: 56, y: 50, team: 'home', label: 'Azaz' },
      { id: 'Forss', x: 72, y: 82, team: 'home', label: 'Forss' },
      { id: 'Whittaker', x: 56, y: 34, team: 'home', label: 'Whittaker' },
      { id: 'Conway', x: 80, y: 48, team: 'home', label: 'Conway' },
      opp('o1', 52, 46), opp('o2', 52, 54), opp('o3', 48, 50), opp('o4', 50, 62),
      opp('o5', 50, 38), opp('o6', 40, 76), opp('o7', 38, 56), opp('o8', 38, 44), opp('o9', 40, 24),
    ]),
  ],
  annotations: [
    { type: 'pass', from: 'Fry', to: 'Hackney', at: 0.5 },
    { type: 'pass', from: 'Hackney', to: 'Azaz', at: 2.2 },
    { type: 'run', playerId: 'Dijksteel', path: [[22, 82], [38, 86], [50, 88]], at: 0.8, duration: 3.0 },
    { type: 'run', playerId: 'Whittaker', path: [[58, 20], [54, 26], [56, 34]], at: 1.0, duration: 2.5 },
    { type: 'zone', polygon: [[34, 35], [56, 35], [56, 65], [34, 65]], label: 'Central overload', at: 1.5, duration: 2.5 },
  ],
}

// Phase 2 — progression with the full-backs advancing late (the 23/24 XI).
const progressionPhase = {
  phaseId: 'carrick-progression',
  formation: '4-2-3-1',
  durationSec: 4.5,
  frames: [
    frame(0, [46, 52], [
      { id: 'GK', x: 14, y: 50, team: 'home', label: 'GK' },
      { id: 'Thomas', x: 55, y: 86, team: 'home', label: 'Thomas' },
      { id: 'Clarke', x: 34, y: 60, team: 'home', label: 'Clarke' },
      { id: 'Ayling', x: 34, y: 40, team: 'home', label: 'Ayling' },
      { id: 'VanDenBerg', x: 50, y: 16, team: 'home', label: 'Van den Berg' },
      { id: 'Howson', x: 46, y: 56, team: 'home', label: 'Howson' },
      { id: 'Barlaser', x: 50, y: 44, team: 'home', label: 'Barlaser' },
      { id: 'Gilbert', x: 58, y: 50, team: 'home', label: 'Gilbert' },
      { id: 'Jones', x: 70, y: 82, team: 'home', label: 'Jones' },
      { id: 'Azaz', x: 60, y: 34, team: 'home', label: 'Azaz' },
      { id: 'LatteLath', x: 76, y: 50, team: 'home', label: 'Latte Lath' },
      opp('o1', 50, 46), opp('o2', 50, 54), opp('o3', 58, 50), opp('o4', 60, 66),
      opp('o5', 60, 34), opp('o6', 74, 78), opp('o7', 80, 56), opp('o8', 80, 44), opp('o9', 74, 24),
    ]),
    frame(2, [66, 70], [
      { id: 'GK', x: 16, y: 50, team: 'home', label: 'GK' },
      { id: 'Thomas', x: 72, y: 88, team: 'home', label: 'Thomas' },
      { id: 'Clarke', x: 40, y: 60, team: 'home', label: 'Clarke' },
      { id: 'Ayling', x: 40, y: 40, team: 'home', label: 'Ayling' },
      { id: 'VanDenBerg', x: 56, y: 16, team: 'home', label: 'Van den Berg' },
      { id: 'Howson', x: 52, y: 56, team: 'home', label: 'Howson' },
      { id: 'Barlaser', x: 56, y: 46, team: 'home', label: 'Barlaser' },
      { id: 'Gilbert', x: 70, y: 52, team: 'home', label: 'Gilbert' },
      { id: 'Jones', x: 80, y: 82, team: 'home', label: 'Jones' },
      { id: 'Azaz', x: 66, y: 38, team: 'home', label: 'Azaz' },
      { id: 'LatteLath', x: 84, y: 46, team: 'home', label: 'Latte Lath' },
      opp('o1', 55, 46), opp('o2', 55, 54), opp('o3', 64, 50), opp('o4', 66, 66),
      opp('o5', 64, 34), opp('o6', 80, 78), opp('o7', 86, 56), opp('o8', 86, 44), opp('o9', 80, 24),
    ]),
    frame(4.5, [88, 84], [
      { id: 'GK', x: 18, y: 50, team: 'home', label: 'GK' },
      { id: 'Thomas', x: 88, y: 88, team: 'home', label: 'Thomas' },
      { id: 'Clarke', x: 46, y: 58, team: 'home', label: 'Clarke' },
      { id: 'Ayling', x: 46, y: 42, team: 'home', label: 'Ayling' },
      { id: 'VanDenBerg', x: 62, y: 18, team: 'home', label: 'Van den Berg' },
      { id: 'Howson', x: 58, y: 54, team: 'home', label: 'Howson' },
      { id: 'Barlaser', x: 62, y: 46, team: 'home', label: 'Barlaser' },
      { id: 'Gilbert', x: 82, y: 54, team: 'home', label: 'Gilbert' },
      { id: 'Jones', x: 90, y: 80, team: 'home', label: 'Jones' },
      { id: 'Azaz', x: 72, y: 42, team: 'home', label: 'Azaz' },
      { id: 'LatteLath', x: 90, y: 48, team: 'home', label: 'Latte Lath' },
      opp('o1', 60, 48), opp('o2', 60, 52), opp('o3', 70, 50), opp('o4', 72, 64),
      opp('o5', 70, 36), opp('o6', 86, 76), opp('o7', 90, 54), opp('o8', 90, 46), opp('o9', 86, 28),
    ]),
  ],
  annotations: [
    { type: 'pass', from: 'Gilbert', to: 'Jones', at: 0.6 },
    { type: 'run', playerId: 'Thomas', path: [[55, 86], [72, 88], [88, 88]], at: 0.8, duration: 3.2 },
    { type: 'pass', from: 'Jones', to: 'LatteLath', at: 3.0 },
    { type: 'run', playerId: 'LatteLath', path: [[76, 50], [84, 46], [90, 48]], at: 2.6, duration: 1.6 },
    { type: 'zone', polygon: [[60, 30], [80, 30], [80, 70], [60, 70]], label: 'Full-back overlap', at: 1.2, duration: 2.6 },
  ],
}

// Phase 3 — final-third combination & central trap (Morris–Hackney–Iheanacho).
const finalThirdPhase = {
  phaseId: 'carrick-final-third',
  formation: '4-2-3-1',
  durationSec: 4,
  frames: [
    frame(0, [62, 52], [
      { id: 'GK', x: 16, y: 50, team: 'home', label: 'GK' },
      { id: 'Dijksteel', x: 66, y: 84, team: 'home', label: 'Dijksteel' },
      { id: 'Fry', x: 44, y: 60, team: 'home', label: 'Fry' },
      { id: 'Edmundson', x: 44, y: 40, team: 'home', label: 'Edmundson' },
      { id: 'Borges', x: 60, y: 16, team: 'home', label: 'Borges' },
      { id: 'Hackney', x: 56, y: 56, team: 'home', label: 'Hackney' },
      { id: 'Morris', x: 58, y: 44, team: 'home', label: 'Morris' },
      { id: 'Azaz', x: 66, y: 52, team: 'home', label: 'Azaz' },
      { id: 'IlingJunior', x: 70, y: 22, team: 'home', label: 'Iling-Junior' },
      { id: 'Conway', x: 74, y: 80, team: 'home', label: 'Conway' },
      { id: 'Iheanacho', x: 78, y: 48, team: 'home', label: 'Iheanacho' },
      opp('o1', 60, 48), opp('o2', 60, 52), opp('o3', 70, 50), opp('o4', 74, 64),
      opp('o5', 74, 36), opp('o6', 86, 74), opp('o7', 90, 56), opp('o8', 90, 44), opp('o9', 86, 26),
    ]),
    frame(2, [80, 80], [
      { id: 'GK', x: 18, y: 50, team: 'home', label: 'GK' },
      { id: 'Dijksteel', x: 80, y: 84, team: 'home', label: 'Dijksteel' },
      { id: 'Fry', x: 50, y: 60, team: 'home', label: 'Fry' },
      { id: 'Edmundson', x: 50, y: 40, team: 'home', label: 'Edmundson' },
      { id: 'Borges', x: 66, y: 16, team: 'home', label: 'Borges' },
      { id: 'Hackney', x: 62, y: 54, team: 'home', label: 'Hackney' },
      { id: 'Morris', x: 64, y: 46, team: 'home', label: 'Morris' },
      { id: 'Azaz', x: 74, y: 50, team: 'home', label: 'Azaz' },
      { id: 'IlingJunior', x: 76, y: 26, team: 'home', label: 'Iling-Junior' },
      { id: 'Conway', x: 84, y: 82, team: 'home', label: 'Conway' },
      { id: 'Iheanacho', x: 84, y: 44, team: 'home', label: 'Iheanacho' },
      opp('o1', 64, 48), opp('o2', 64, 52), opp('o3', 74, 50), opp('o4', 78, 64),
      opp('o5', 78, 36), opp('o6', 88, 74), opp('o7', 92, 56), opp('o8', 92, 44), opp('o9', 88, 28),
    ]),
    frame(3.5, [88, 50], [
      { id: 'GK', x: 20, y: 50, team: 'home', label: 'GK' },
      { id: 'Dijksteel', x: 90, y: 84, team: 'home', label: 'Dijksteel' },
      { id: 'Fry', x: 56, y: 58, team: 'home', label: 'Fry' },
      { id: 'Edmundson', x: 56, y: 42, team: 'home', label: 'Edmundson' },
      { id: 'Borges', x: 70, y: 18, team: 'home', label: 'Borges' },
      { id: 'Hackney', x: 70, y: 52, team: 'home', label: 'Hackney' },
      { id: 'Morris', x: 72, y: 48, team: 'home', label: 'Morris' },
      { id: 'Azaz', x: 84, y: 54, team: 'home', label: 'Azaz' },
      { id: 'IlingJunior', x: 80, y: 30, team: 'home', label: 'Iling-Junior' },
      { id: 'Conway', x: 92, y: 80, team: 'home', label: 'Conway' },
      { id: 'Iheanacho', x: 86, y: 50, team: 'home', label: 'Iheanacho' },
      opp('o1', 68, 48), opp('o2', 68, 52), opp('o3', 78, 50), opp('o4', 82, 62),
      opp('o5', 82, 38), opp('o6', 90, 72), opp('o7', 93, 54), opp('o8', 93, 46), opp('o9', 90, 30),
    ]),
  ],
  annotations: [
    { type: 'pass', from: 'Dijksteel', to: 'Azaz', at: 0.6 },
    { type: 'run', playerId: 'Conway', path: [[74, 80], [84, 82], [92, 80]], at: 0.8, duration: 2.4 },
    { type: 'pass', from: 'Conway', to: 'Iheanacho', at: 2.6 },
    { type: 'zone', polygon: [[58, 38], [86, 38], [86, 62], [58, 62]], label: 'Central trap & overload', at: 0.8, duration: 2.6 },
  ],
}

const tactics = (
  phase: unknown,
  title: string,
): StoryboardLayerConfig => ({
  type: 'fs:tactics-board',
  title,
  homeLabel: 'Carrick XI',
  awayLabel: 'Opposition',
  homeColor: BORO,
  awayColor: '#3b4a63',
  accent: '#e0b341',
  loop: true,
  phase,
})

// ---------------------------------------------------------------------------

export const carrickUnited: Storyboard = {
  slug: 'carrick-united',
  title: 'Carrick restores the balance',
  subtitle:
    'Appointed Manchester United interim head coach until the end of 2025/26, Michael Carrick took the team from 6th to 3rd — not with chaos, but with control. The same short-passing, central-overload blueprint he built at Middlesbrough, told through the data.',
  byline: 'footshorts · tactics',
  accent: MUN,
  sections: [
    {
      id: 'build-up',
      heading: 'Building from the back',
      prose: [
        'The first principle is patience. The keeper splits the centre-backs, the double pivot drops in, and the ball is worked out through short, staggered passing lanes rather than hopeful long balls.',
        'Watch the right side: the centre-back steps out and feeds the deeper pivot, who turns and finds the number ten between the lines. As the pass travels, the right-back overlaps and the winger drops inside — deliberately overloading the central channel.',
      ],
      layer: tactics(buildUpPhase, 'Building from the back'),
    },
    {
      id: 'progression',
      heading: 'Progression through the lines',
      prose: [
        'With central numbers secured, the full-backs provide the width — advancing fast but late. One winger holds the touchline while the other narrows alongside the ten.',
        'The short combinations draw the block across before the ball is released wide into the space the narrowed winger vacated.',
      ],
      layer: tactics(progressionPhase, 'Progression through the lines'),
    },
    {
      id: 'final-third',
      heading: 'The final-third trap',
      prose: [
        'In the final third the same patience turns ruthless. Boro work short connections into a central triangle, dragging the low block narrow, then switch and attack the cut-back zone.',
        'The striker stretches the line; the runners arrive at the penalty spot. Build-up so controlled the finish looks easy.',
      ],
      layer: tactics(finalThirdPhase, 'The final-third trap'),
    },
    {
      id: 'table',
      heading: 'Third in the table',
      prose: [
        'Ten wins in fifteen league games. The control showed up where it counts — United climbed into the Champions League places and held them.',
      ],
      layer: { type: 'fs:standings-table', rows: standingsRows },
    },
    {
      id: 'climb',
      heading: 'From sixth to third',
      prose: [
        'Position by matchday tells the story better than any quote. The red line bends upward from the moment Carrick takes charge — steady, not spectacular.',
      ],
      layer: {
        type: 'fs:standings-over-matchdays',
        competitionLabel: 'Premier League · 2025/26',
        totalMatchdays: 38,
        lanes,
      },
    },
    {
      id: 'derby',
      heading: 'The statement win',
      prose: [
        'A compact mid-block, then coordinated pressure once City played into the trap. The derby was the proof of concept.',
      ],
      layer: munCityCard,
    },
    {
      id: 'liverpool',
      heading: 'Controlling the big games',
      prose: [
        'Against Liverpool, United stayed compact and struck on coordinated triggers — a 2–0 that never felt in doubt.',
      ],
      layer: munLiverpoolTile,
    },
    {
      id: 'chelsea',
      heading: 'Ruthless at home',
      prose: [
        'The circulation became calmer, the distances shorter. Chelsea were picked apart 3–1 at Old Trafford.',
      ],
      layer: munChelseaRow,
    },
    {
      id: 'cup',
      heading: 'A run to Wembley',
      prose: [
        'The same balance carried into the cup: knockout ties controlled rather than survived, all the way to a final against City.',
      ],
      layer: faCupBracket,
    },
  ],
}
