/**
 * Recap → foreground ingestion checks (run: npx tsx src/__fixtures__/recapForeground.test.ts)
 *
 *   1. extract     — fs: fences in recap markdown parse to typed directives,
 *                    non-fs fences are ignored, malformed bodies are dropped.
 *   2. order graft — graftRecapForeground fills model-placed layers by type in
 *                    document order and reports unused directives.
 *   3. content graft — graftSectionBody fills a section's layer with the recap
 *                    directive whose teams/competition overlap the section text.
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

console.log('\nALL RECAP INGESTION CHECKS PASSED')
