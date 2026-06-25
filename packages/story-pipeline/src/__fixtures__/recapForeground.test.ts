/**
 * Recap → foreground ingestion checks (run: npx tsx src/__fixtures__/recapForeground.test.ts)
 *
 *   1. extract     — fs: fences in recap markdown parse to typed directives,
 *                    non-fs fences are ignored, malformed bodies are dropped.
 *   2. order graft — graftRecapForeground fills model-placed layers by type in
 *                    document order and reports unused directives.
 *   3. content graft — graftSectionBody fills a section's layer with the recap
 *                    directive whose teams/competition overlap the section text.
 *   4. grid graft   — a GRID match-card keeps its layout and fills each tile from
 *                    a matching single-fixture directive (never collapses to one).
 */
import assert from 'node:assert'
import { extractFsDirectives } from '@vismay/viz-engine/src/lib/recapFences'
import {
  graftRecapForeground,
  graftSectionBody,
  collectRecapDirectives,
} from '../ingest/recapForeground'
import type { GeneratedStory } from '../types'

const recap = `# Match-day recap — 2026-06-14

## Premier League

### Arsenal 2–1 Chelsea

*HT 1–0 · 14:00 UTC · MD 35*

\`\`\`fs:match-card
{ "layout": "score", "home": "Arsenal", "away": "Chelsea", "score": "2–1", "competition": "Premier League · matchday 35", "competitionSlug": "premier-league" }
\`\`\`

### Liverpool 3–0 Everton

\`\`\`fs:match-card
{ "layout": "score", "home": "Liverpool", "away": "Everton", "score": "3–0", "competitionSlug": "premier-league" }
\`\`\`

### Table

\`\`\`fs:standings-table
{ "rows": [ { "position": 1, "team_id": "arsenal", "team": { "id": "arsenal", "slug": "arsenal", "name": "Arsenal", "crest_url": null }, "competition_slug": "premier-league", "season": "2025", "played": 35, "won": 25, "draw": 6, "lost": 4, "goals_for": 80, "goals_against": 30, "goal_difference": 50, "points": 81, "form": "WWWDW" } ] }
\`\`\`

\`\`\`json
{ "not": "an fs directive" }
\`\`\`

\`\`\`fs:bracket
{ this is not valid json }
\`\`\`
`

// 1. extract -----------------------------------------------------------------
const directives = extractFsDirectives(recap)
assert.equal(directives.length, 3, `expected 3 fs: directives, got ${directives.length}`)
assert.deepEqual(
  directives.map((d) => d.type),
  ['fs:match-card', 'fs:match-card', 'fs:standings-table'],
  'types/order wrong',
)
assert.equal(directives[0]!.config.home, 'Arsenal')
assert.equal(directives[0]!.config.type, 'fs:match-card', 'type back-filled from info-string')
console.log('✓ extract: 3 directives, non-fs + malformed fences ignored')

// 2. order graft -------------------------------------------------------------
const story: GeneratedStory = {
  slug: 'matchday',
  format: 'deck',
  frontmatter: {},
  charts: [],
  imagePrompts: [],
  sections: [
    { heading: 'A', paragraphs: [], kind: 'fixture', body: { foreground: [{ type: 'fs:match-card', home: '?', away: '?' }] } },
    { heading: 'B', paragraphs: [], kind: 'fixture', body: { foreground: [{ type: 'fs:match-card', home: '?', away: '?', style: { pad: 1 } }] } },
    { heading: 'C', paragraphs: [], kind: 'table', body: { foreground: { layout: 'one', regions: { main: [{ type: 'fs:standings-table', rows: [] }] } } } },
  ],
}
const res = graftRecapForeground(story, [recap])
assert.equal(res.applied, 3, `expected 3 applied, got ${res.applied}`)
assert.equal(res.unused.length, 0)
const a = (story.sections[0]!.body.foreground as any[])[0]
const b = (story.sections[1]!.body.foreground as any[])[0]
assert.equal(a.home, 'Arsenal', 'section A got first match-card')
assert.equal(b.home, 'Liverpool', 'section B got second match-card')
assert.deepEqual(b.style, { pad: 1 }, 'engine-level style preserved across graft')
const c = ((story.sections[2]!.body.foreground as any).regions.main as any[])[0]
assert.ok(Array.isArray(c.rows) && c.rows.length === 1, 'standings-table filled inside regions')
console.log('✓ order graft: 3 layers filled in document order, style preserved, regions walked')

// 3. content graft -----------------------------------------------------------
const directives2 = collectRecapDirectives([recap])
const body = { foreground: [{ type: 'fs:match-card', home: '?', away: '?' }] }
// Section text mentions Liverpool/Everton — should pull the SECOND card, not the first.
const filled = graftSectionBody(body, directives2, 'Liverpool thrash Everton 3–0 at Anfield')
assert.equal(filled, 1)
assert.equal((body.foreground[0] as any).home, 'Liverpool', 'content match chose Liverpool card')
console.log('✓ content graft: layer filled by team/competition overlap, not order')

// 4. grid graft --------------------------------------------------------------
// The recap emits ONE single-fixture card per match; a "matchday at a glance"
// beat is a GRID match-card tiling several. Grafting must fill each tile from a
// matching fixture directive, NOT collapse the grid onto a single fixture.
const gridDirectives = collectRecapDirectives([recap])
const gridBody = {
  foreground: [
    {
      type: 'fs:match-card',
      layout: 'grid',
      columns: 2,
      // Model-guessed tiles (note "Liverpool/Everton" name + intentionally
      // reversed order vs. the recap document order).
      cards: [
        { home: 'Liverpool', away: 'Everton' },
        { home: 'Arsenal', away: 'Chelsea' },
      ],
    },
  ],
}
const gridFilled = graftSectionBody(
  gridBody as any,
  gridDirectives,
  'Match-day round-up: Arsenal beat Chelsea and Liverpool thrashed Everton.',
)
assert.equal(gridFilled, 1, 'one grid layer grafted')
const grid = gridBody.foreground[0] as any
assert.equal(grid.layout, 'grid', 'grid layout preserved (not collapsed)')
assert.equal(grid.columns, 2, 'grid columns preserved')
assert.ok(Array.isArray(grid.cards) && grid.cards.length === 2, 'both tiles kept')
// Tile order is the model's; each tile carries its OWN fixture's real data.
assert.equal(grid.cards[0].home, 'Liverpool', 'tile 0 stays Liverpool')
assert.equal(grid.cards[0].score, '3–0', 'tile 0 got Liverpool–Everton score')
assert.equal(grid.cards[1].home, 'Arsenal', 'tile 1 stays Arsenal')
assert.equal(grid.cards[1].score, '2–1', 'tile 1 got Arsenal–Chelsea score')
assert.equal(grid.cards[1].competition, 'Premier League · matchday 35', 'tile 1 competition filled')
console.log('✓ grid graft: layout preserved, each tile filled by its own fixture')

console.log('\nALL RECAP INGESTION CHECKS PASSED')
