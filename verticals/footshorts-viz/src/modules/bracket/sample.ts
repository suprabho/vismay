import type { BracketConfig } from './index'

/**
 * List-layout sample: a couple of two-legged ties + an upcoming semi-final.
 * Stages use the canonical UPPER_SNAKE codes that `buildBracket` recognises
 * (see stageLabel.ts KNOCKOUT_STAGES) — lowercase 'quarter-final' would be
 * filtered out as a non-knockout stage and the bracket would render empty.
 */
export const sample: BracketConfig = {
  type: 'fs:bracket',
  fixtures: [
    {
      id: 'sample-ucl-qf1-leg1',
      competition_slug: 'champions-league',
      season: '2025',
      matchday: null,
      stage: 'QUARTER_FINALS',
      phase: 'knockout',
      kickoff_at: '2026-04-08T19:00:00Z',
      status: 'finished',
      home_score: 2,
      away_score: 1,
      home_team_name: 'Arsenal',
      away_team_name: 'Real Madrid',
      home: { id: 'arsenal', slug: 'arsenal', name: 'Arsenal', crest_url: null },
      away: {
        id: 'real-madrid',
        slug: 'real-madrid',
        name: 'Real Madrid',
        crest_url: null,
      },
    },
    {
      id: 'sample-ucl-qf1-leg2',
      competition_slug: 'champions-league',
      season: '2025',
      matchday: null,
      stage: 'QUARTER_FINALS',
      phase: 'knockout',
      kickoff_at: '2026-04-15T19:00:00Z',
      status: 'finished',
      home_score: 1,
      away_score: 2,
      home_team_name: 'Real Madrid',
      away_team_name: 'Arsenal',
      home: {
        id: 'real-madrid',
        slug: 'real-madrid',
        name: 'Real Madrid',
        crest_url: null,
      },
      away: { id: 'arsenal', slug: 'arsenal', name: 'Arsenal', crest_url: null },
    },
    {
      id: 'sample-ucl-sf1',
      competition_slug: 'champions-league',
      season: '2025',
      matchday: null,
      stage: 'SEMI_FINALS',
      phase: 'knockout',
      kickoff_at: '2026-05-01T19:00:00Z',
      status: 'scheduled',
      home_score: null,
      away_score: null,
      home_team_name: 'Arsenal',
      away_team_name: 'Bayern Munich',
      home: { id: 'arsenal', slug: 'arsenal', name: 'Arsenal', crest_url: null },
      away: {
        id: 'bayern',
        slug: 'bayern',
        name: 'Bayern Munich',
        crest_url: null,
      },
    },
  ],
}

/**
 * Tree-layout sample: a full eight-team knockout (QF → SF → Final) rendered as
 * the mirrored tournament bracket. Arsenal's path is highlighted; the final is
 * still pending so the tree shows a "TBD"-style centre tie. Single-leg ties are
 * fine — buildBracket reports the one finished leg as the aggregate.
 *
 * Kickoffs are ordered so the left half (Arsenal's side) sorts before the right
 * half, and feeders line up under their parent tie (QF[0,1] → SF[0], etc).
 */
export const sampleTree: BracketConfig = {
  type: 'fs:bracket',
  layout: 'tree',
  highlightTeamId: 'arsenal',
  title: 'Champions League · Final',
  competitionSlug: 'champions-league',
  fixtures: [
    // --- Quarter-finals (left half first) ---
    {
      id: 'tree-qf-l1',
      competition_slug: 'champions-league',
      season: '2025',
      matchday: null,
      stage: 'QUARTER_FINALS',
      phase: 'knockout',
      kickoff_at: '2026-04-08T19:00:00Z',
      status: 'finished',
      home_score: 3,
      away_score: 1,
      home_team_name: 'Arsenal',
      away_team_name: 'Inter Milan',
      home: { id: 'arsenal', slug: 'arsenal', name: 'Arsenal', crest_url: null, primary_color: '#EF0107' },
      away: { id: 'inter', slug: 'inter', name: 'Inter Milan', crest_url: null, primary_color: '#0068A8' },
    },
    {
      id: 'tree-qf-l2',
      competition_slug: 'champions-league',
      season: '2025',
      matchday: null,
      stage: 'QUARTER_FINALS',
      phase: 'knockout',
      kickoff_at: '2026-04-09T19:00:00Z',
      status: 'finished',
      home_score: 2,
      away_score: 1,
      home_team_name: 'Bayern Munich',
      away_team_name: 'FC Barcelona',
      home: { id: 'bayern', slug: 'bayern', name: 'Bayern Munich', crest_url: null, primary_color: '#DC052D' },
      away: { id: 'barcelona', slug: 'barcelona', name: 'FC Barcelona', crest_url: null, primary_color: '#A50044' },
    },
    {
      id: 'tree-qf-r1',
      competition_slug: 'champions-league',
      season: '2025',
      matchday: null,
      stage: 'QUARTER_FINALS',
      phase: 'knockout',
      kickoff_at: '2026-04-15T19:00:00Z',
      status: 'finished',
      home_score: 2,
      away_score: 0,
      home_team_name: 'Real Madrid',
      away_team_name: 'Manchester City',
      home: { id: 'real-madrid', slug: 'real-madrid', name: 'Real Madrid', crest_url: null, primary_color: '#FEBE10' },
      away: { id: 'manchester-city', slug: 'manchester-city', name: 'Manchester City', crest_url: null, primary_color: '#6CABDD' },
    },
    {
      id: 'tree-qf-r2',
      competition_slug: 'champions-league',
      season: '2025',
      matchday: null,
      stage: 'QUARTER_FINALS',
      phase: 'knockout',
      kickoff_at: '2026-04-16T19:00:00Z',
      status: 'finished',
      home_score: 1,
      away_score: 2,
      home_team_name: 'Paris Saint-Germain',
      away_team_name: 'Liverpool',
      home: { id: 'psg', slug: 'psg', name: 'Paris Saint-Germain', crest_url: null, primary_color: '#004170' },
      away: { id: 'liverpool', slug: 'liverpool', name: 'Liverpool', crest_url: null, primary_color: '#C8102E' },
    },
    // --- Semi-finals ---
    {
      id: 'tree-sf-l',
      competition_slug: 'champions-league',
      season: '2025',
      matchday: null,
      stage: 'SEMI_FINALS',
      phase: 'knockout',
      kickoff_at: '2026-05-01T19:00:00Z',
      status: 'finished',
      home_score: 2,
      away_score: 1,
      home_team_name: 'Arsenal',
      away_team_name: 'Bayern Munich',
      home: { id: 'arsenal', slug: 'arsenal', name: 'Arsenal', crest_url: null, primary_color: '#EF0107' },
      away: { id: 'bayern', slug: 'bayern', name: 'Bayern Munich', crest_url: null, primary_color: '#DC052D' },
    },
    {
      id: 'tree-sf-r',
      competition_slug: 'champions-league',
      season: '2025',
      matchday: null,
      stage: 'SEMI_FINALS',
      phase: 'knockout',
      kickoff_at: '2026-05-02T19:00:00Z',
      status: 'finished',
      home_score: 3,
      away_score: 2,
      home_team_name: 'Real Madrid',
      away_team_name: 'Liverpool',
      home: { id: 'real-madrid', slug: 'real-madrid', name: 'Real Madrid', crest_url: null, primary_color: '#FEBE10' },
      away: { id: 'liverpool', slug: 'liverpool', name: 'Liverpool', crest_url: null, primary_color: '#C8102E' },
    },
    // --- Final (pending) ---
    {
      id: 'tree-final',
      competition_slug: 'champions-league',
      season: '2025',
      matchday: null,
      stage: 'FINAL',
      phase: 'knockout',
      kickoff_at: '2026-05-28T19:00:00Z',
      status: 'scheduled',
      home_score: null,
      away_score: null,
      home_team_name: 'Arsenal',
      away_team_name: 'Real Madrid',
      home: { id: 'arsenal', slug: 'arsenal', name: 'Arsenal', crest_url: null, primary_color: '#EF0107' },
      away: { id: 'real-madrid', slug: 'real-madrid', name: 'Real Madrid', crest_url: null, primary_color: '#FEBE10' },
    },
  ],
}

/**
 * Vertical-tree sample: the same eight-team knockout as {@link sampleTree}, but
 * forced into the mobile top-to-bottom layout. The `tree` layout switches to
 * this automatically on narrow viewports; `tree-vertical` opts in regardless of
 * width (handy for portrait video / phone previews).
 */
export const sampleTreeVertical: BracketConfig = {
  ...sampleTree,
  layout: 'tree-vertical',
}

/**
 * Incomplete-bracket sample: a World Cup Round of 32 published before the draw
 * is finished. 14 teams are locked into their spots; every other slot is still
 * a qualification descriptor ("Winner Group I", "3rd A/C/D/F", "Runner-up K"),
 * and the Round of 16 → Final are entirely TBD.
 *
 * This is the `rounds` (static) authoring path — there are no fixtures yet, so
 * the structure is given verbatim and built via `buildStaticBracket`. Slot
 * shorthands: a `{ team }` object = confirmed entrant (crest + flag from the
 * bundled palette), a bare string = placeholder, `{}`/omitted = a blank TBD.
 */
export const sampleIncomplete: BracketConfig = {
  type: 'fs:bracket',
  layout: 'tree',
  title: 'World Cup 26 · Round of 32',
  competitionSlug: 'world-cup',
  rounds: [
    {
      stage: 'ROUND_OF_32',
      ties: [
        { a: { team: 'germany' }, b: '3rd A/C/D/F' },
        { a: 'Winner Group I', b: '3rd D/F/G/H' },
        { a: { team: 'south-africa' }, b: { team: 'canada' } },
        { a: { team: 'netherlands' }, b: { team: 'morocco' } },
        { a: 'Runner-up K', b: 'Runner-up L' },
        { a: 'Winner Group H', b: 'Runner-up J' },
        { a: { team: 'usa' }, b: { team: 'bosnia' } },
        { a: 'Winner Group G', b: '3rd A/H/I/J' },
        { a: { team: 'brazil' }, b: { team: 'japan' } },
        { a: { team: 'ivory-coast', name: "Côte d'Ivoire" }, b: 'Runner-up I' },
        { a: { team: 'mexico' }, b: '3rd C/E/H' },
        { a: 'Winner Group L', b: '3rd E/I/J/K' },
        { a: { team: 'argentina' }, b: 'Runner-up H' },
        { a: { team: 'australia' }, b: 'Runner-up G' },
        { a: { team: 'switzerland' }, b: '3rd E/F/G/I/J' },
        { a: 'Winner Group K', b: '3rd D/E/I/J/L' },
      ],
    },
    // Later rounds exist in the draw but no participants are known yet.
    { stage: 'ROUND_OF_16', ties: [{}, {}, {}, {}, {}, {}, {}, {}] },
    { stage: 'QUARTER_FINALS', ties: [{}, {}, {}, {}] },
    { stage: 'SEMI_FINALS', ties: [{}, {}] },
    { stage: 'FINAL', ties: [{}] },
  ],
}

/**
 * The same incomplete World Cup draw forced into the portrait/mobile layout.
 */
export const sampleIncompleteVertical: BracketConfig = {
  ...sampleIncomplete,
  layout: 'tree-vertical',
}
