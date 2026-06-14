/**
 * Recap generator → module parseConfig contract check
 * (run: npx tsx src/__fixtures__/recapGenShapes.test.ts)
 *
 * The recap generator (apps/footshorts/worker/src/recap.ts) emits fs: fences as
 * JSON. This proves the EXACT config shapes it produces survive the fence parser
 * and validate against each module's REAL parseConfig — so what lands in a recap
 * actually renders. Mirrors the fence builders' output verbatim.
 */
import assert from 'node:assert'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractFsDirectives } from '@vismay/viz-engine/src/lib/recapFences'

const teamRef = (id: string, name: string) => ({ id, slug: id, name, crest_url: null })
const fixtureRow = (id: string, home: string, away: string, stage: string | null) => ({
  id,
  competition_slug: 'premier-league',
  season: '2025',
  matchday: 35,
  stage,
  phase: stage ? 'knockout' : 'league',
  kickoff_at: '2026-06-14T14:00:00Z',
  status: 'finished',
  home_score: 2,
  away_score: 1,
  home_team_name: home,
  away_team_name: away,
  home: teamRef(home.toLowerCase(), home),
  away: teamRef(away.toLowerCase(), away),
})

// Exactly the shapes recap.ts's fence builders emit (matchCardFence,
// standingsTableFence, bracketFence) — plus match-tile/match-row which the
// contract + viewer + ingest support uniformly.
const fences: Record<string, Record<string, unknown>> = {
  'fs:match-card': {
    layout: 'score',
    home: 'Arsenal',
    away: 'Chelsea',
    competition: 'Premier League · matchday 35',
    competitionSlug: 'premier-league',
    kickoff: '14:00 UTC',
    score: '2–1',
  },
  'fs:standings-table': {
    rows: [
      {
        competition_slug: 'premier-league',
        season: '2025',
        team_id: 'arsenal',
        position: 1,
        played: 35,
        won: 25,
        draw: 6,
        lost: 4,
        goals_for: 80,
        goals_against: 30,
        goal_difference: 50,
        points: 81,
        form: 'WWWDW',
        team: teamRef('arsenal', 'Arsenal'),
      },
    ],
  },
  'fs:bracket': {
    layout: 'list',
    competitionSlug: 'premier-league',
    title: 'Premier League',
    fixtures: [fixtureRow('qf1', 'Arsenal', 'Chelsea', 'QUARTER_FINALS')],
  },
  'fs:match-tile': { fixture: fixtureRow('m1', 'Arsenal', 'Chelsea', null) },
  'fs:match-row': { variant: 'compact', fixture: fixtureRow('m1', 'Arsenal', 'Chelsea', null) },
}

const MODULE_DIR: Record<string, string> = {
  'fs:match-card': 'match-card',
  'fs:standings-table': 'standings-table',
  'fs:bracket': 'bracket',
  'fs:match-tile': 'match-tile',
  'fs:match-row': 'match-row',
}

void (async () => {
  let failed = false
  for (const [type, config] of Object.entries(fences)) {
    // Round-trip through the literal fence text the generator writes.
    const md = '```' + type + '\n' + JSON.stringify(config) + '\n```\n'
    const directives = extractFsDirectives(md)
    assert.equal(directives.length, 1, `${type}: fence did not parse`)
    const dir = directives[0]!
    assert.equal(dir.type, type)
    try {
      const path = join(__dirname, '../../../..', 'verticals/footshorts-viz/src/modules', MODULE_DIR[type]!, 'index.ts')
      // eslint-disable-next-line no-await-in-loop
      const mod = (await import(pathToFileURL(path).href)).default as {
        parseConfig: (raw: unknown, ctx: { slug: string; label: string }) => unknown
      }
      mod.parseConfig(dir.config, { slug: 'recap-gen-test', label: type })
      console.log(`✓ ${type}: fence parses + real parseConfig accepts the generator shape`)
    } catch (e) {
      failed = true
      console.log(`✗ ${type}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log(failed ? '\n✗ FAILURES above' : '\nALL GENERATOR-SHAPE CHECKS PASSED')
  if (failed) process.exitCode = 1
})()
