/** Throwaway check: the footshorts block builders shape real DB rows into the
 *  exact `fs:*` viz-module configs the canvas drops onto a story.
 *  (run: npx tsx src/footshortsBlocks.test.ts) */
import {
  buildStandingsTableBlock,
  buildMatchCardBlock,
  buildMatchTileBlock,
  buildMatchRowBlock,
  buildMatchTimelineBlock,
  buildTeamFormStripBlock,
  type FixtureRowInput,
  type StandingRowInput,
  type FixtureEventInput,
} from './footshortsBlocks'

let failures = 0
const ok = (label: string, pass: boolean, extra = '') => {
  if (!pass) failures++
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)
}

const team = (slug: string, color: string | null = null): StandingRowInput['team'] => ({
  id: slug,
  slug,
  name: slug.toUpperCase(),
  crest_url: null,
  primary_color: color,
})

const fixture = (over: Partial<FixtureRowInput> = {}): FixtureRowInput => ({
  id: 'm1',
  competition_slug: 'champions-league',
  season: '25-26',
  matchday: 8,
  stage: null,
  kickoff_at: '2026-04-21T19:00:00Z',
  status: 'finished',
  home_score: 2,
  away_score: 1,
  home_team_name: null,
  away_team_name: null,
  home: { id: 'arsenal', slug: 'arsenal', name: 'Arsenal', crest_url: null, primary_color: '#EF0107' },
  away: { id: 'chelsea', slug: 'chelsea', name: 'Chelsea', crest_url: null, primary_color: '#034694' },
  ...over,
})

// ── fs:standings-table ──────────────────────────────────────────────────────
const rows: StandingRowInput[] = [
  { competition_slug: 'champions-league', season: '25-26', team_id: 'arsenal', position: 1,
    played: 8, won: 7, draw: 1, lost: 0, goals_for: 20, goals_against: 5, goal_difference: 15,
    points: 22, form: null, team: team('arsenal') },
]
const st = buildStandingsTableBlock(rows)
ok('standings-table type', st.type === 'fs:standings-table')
ok('standings-table passes rows through', st.rows.length === 1 && st.rows[0]!.team_id === 'arsenal')

// ── fs:match-card ───────────────────────────────────────────────────────────
const finished = buildMatchCardBlock(fixture(), { competitionName: 'Champions League' })
ok('match-card type + layout default', finished.type === 'fs:match-card' && finished.layout === 'horizontal')
ok('match-card FT score', finished.score === '2 – 1' && finished.kickoff === 'FT')
ok('match-card carries team colors', finished.homeColor === '#EF0107' && finished.awayColor === '#034694')
ok('match-card home/away are slugs', finished.home === 'arsenal' && finished.away === 'chelsea')

const upcoming = buildMatchCardBlock(fixture({ status: 'scheduled', home_score: null, away_score: null }), {})
ok('match-card omits score when unplayed', upcoming.score === undefined && upcoming.kickoff !== 'FT')

const noColor = buildMatchCardBlock(
  fixture({ home: { id: 'x', slug: 'x', name: 'X', crest_url: null }, away: { id: 'y', slug: 'y', name: 'Y', crest_url: null } }),
  {},
)
ok('match-card omits colors when absent', noColor.homeColor === undefined && noColor.awayColor === undefined)

// ── fs:match-tile ───────────────────────────────────────────────────────────
const tile = buildMatchTileBlock(fixture())
ok('match-tile type + fixture', tile.type === 'fs:match-tile' && tile.fixture.id === 'm1')
ok('match-tile omits crest when none', tile.competitionCrest === undefined)

// ── fs:match-row ────────────────────────────────────────────────────────────
ok('match-row default variant compact', buildMatchRowBlock(fixture()).variant === 'compact')
ok('match-row explicit variant', buildMatchRowBlock(fixture(), { variant: 'expanded' }).variant === 'expanded')

// ── fs:match-timeline ───────────────────────────────────────────────────────
const events: FixtureEventInput[] = [
  { id: 'g1', fixture_id: 'm1', team_id: null, side: 'home', minute: 23, extra_minute: null,
    type: 'goal', detail: 'Normal Goal', player_name: 'Saka', assist_name: 'Ødegaard' },
]
const tl = buildMatchTimelineBlock(events, { filter: 'goal' })
ok('match-timeline type + events', tl.type === 'fs:match-timeline' && tl.events.length === 1)
ok('match-timeline filter passthrough', tl.filter === 'goal')
ok('match-timeline omits filter by default', buildMatchTimelineBlock(events).filter === undefined)

// ── fs:team-form-strip ──────────────────────────────────────────────────────
const form = buildTeamFormStripBlock([fixture()], 'arsenal', { label: 'Arsenal · last 5', columns: 5, rows: 1 })
ok('team-form-strip type + teamId', form.type === 'fs:team-form-strip' && form.teamId === 'arsenal')
ok('team-form-strip defaults to grid', form.layout === 'grid')
ok('team-form-strip carries grid opts', form.columns === 5 && form.rows === 1 && form.label === 'Arsenal · last 5')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exit(1)
