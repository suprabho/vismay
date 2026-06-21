/**
 * DomainPack seam checks (run: npx tsx src/__fixtures__/packs.test.ts)
 *
 *   1. snapshot   — every prompt builder's default-pack output is byte-identical
 *                   to the pre-refactor vizmayaPrompts.snapshot.json
 *   2. isolation  — each desk's menu carries ITS vertical types and no other's;
 *                   vizmaya carries none
 *   3. voice      — pack personas/guidance splice into the systems
 *   4. schema     — a pack body schema accepts its vertical layer and
 *                   normalizes; the default schema rejects it; map schemas
 *                   never accept vertical layers
 *   5. lint       — a vertical layer outside the desk's menu is flagged
 *   6. anti-drift — each pack layer's zod-valid sample parses through the REAL
 *                   module parseConfig (dynamic non-literal import, so the
 *                   stub-based standalone tsc never sees the vertical sources)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  researchSystem,
  anglesSystem,
  chartSystem,
  regionsSystem,
  subsectionContentSystem,
  subsectionVisualSystem,
  outlineSystem,
  contentSystem,
  visualSystem,
} from '../prompts'
import { sectionVisualSchemaFor } from '../schema'
import { normalizeSectionBody } from '../vizEngine'
import { lintSectionBody } from '../lintLayout'
import { F1_PACK, FOOTSHORTS_PACK, VIZMAYA_PACK, packForVertical } from '../packs'
import type { PackLayerType } from '../packs'

let failed = false
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed = true
}

// ── 1. snapshot equality ────────────────────────────────────────────────────
const snapshot = JSON.parse(
  readFileSync(join(__dirname, 'vizmayaPrompts.snapshot.json'), 'utf8'),
) as Record<string, string>
const surfaces: Record<string, string> = {
  RESEARCH_SYSTEM: researchSystem(),
  ANGLES_SYSTEM: anglesSystem(),
  CHART_SYSTEM: chartSystem(),
  REGIONS_SYSTEM: regionsSystem(),
  SUBSECTION_CONTENT_SYSTEM: subsectionContentSystem(),
  SUBSECTION_VISUAL_SYSTEM: subsectionVisualSystem(),
  'outlineSystem.deck': outlineSystem('deck'),
  'outlineSystem.map': outlineSystem('map'),
  'contentSystem.deck': contentSystem('deck'),
  'contentSystem.map': contentSystem('map'),
  'visualSystem.deck': visualSystem('deck'),
  'visualSystem.map': visualSystem('map'),
}
for (const [name, text] of Object.entries(surfaces)) {
  check(`snapshot ${name}`, text === snapshot[name])
}

// ── 2. menu isolation ───────────────────────────────────────────────────────
const f1Visual = visualSystem('deck', F1_PACK)
const fsVisual = visualSystem('deck', FOOTSHORTS_PACK)
const vmVisual = visualSystem('deck')
check('f1 menu has f1 types', f1Visual.includes('f1:race-card') && f1Visual.includes('f1:driver-standings'))
check('f1 menu has no fs types', !f1Visual.includes('fs:'))
check('fs menu has fs types', fsVisual.includes('fs:match-card') && fsVisual.includes('fs:standings-table') && fsVisual.includes('fs:team-form-strip'))
check('fs menu has no f1 types', !fsVisual.includes('f1:'))
check('vizmaya menu has no vertical types', !vmVisual.includes('f1:') && !vmVisual.includes('fs:'))
check('f1 outline inline list has f1 types', outlineSystem('deck', F1_PACK).includes('f1:race-card'))
check('f1 outline plans the modules', outlineSystem('deck', F1_PACK).includes(F1_PACK.outlineGuidance!))
check('fs outline plans the modules', outlineSystem('deck', FOOTSHORTS_PACK).includes(FOOTSHORTS_PACK.outlineGuidance!))
check('packForVertical resolves', packForVertical('f1') === F1_PACK && packForVertical('footshorts') === FOOTSHORTS_PACK && packForVertical(null) === VIZMAYA_PACK && packForVertical('starship') === VIZMAYA_PACK)

// ── 3. voice splice ─────────────────────────────────────────────────────────
check('f1 research persona', researchSystem(F1_PACK).startsWith(F1_PACK.persona))
check('fs angles persona', anglesSystem(FOOTSHORTS_PACK).startsWith(FOOTSHORTS_PACK.persona))
check('f1 content voice', contentSystem('deck', F1_PACK).includes(F1_PACK.contentGuidance!))
check('fs visual guidance', fsVisual.includes(FOOTSHORTS_PACK.visualGuidance!))
check('f1 vertical doc block', f1Visual.includes('VIZF1 VERTICAL MODULES'))
check('desk name splices', chartSystem(F1_PACK).includes('a VizF1 data story') && regionsSystem(FOOTSHORTS_PACK).includes('a Footshorts map story'))

// ── 4. schema accept / reject ───────────────────────────────────────────────
const SAMPLES: Record<string, Record<string, unknown>> = {
  'f1:race-card': {
    type: 'f1:race-card',
    layout: 'score',
    grandPrix: 'Monaco Grand Prix',
    season: 2026,
    round: 7,
    date: '2026-05-24',
    sessionLabel: 'Race · Sun 14:00',
    winner: 'Charles Leclerc',
  },
  'f1:driver-standings': {
    type: 'f1:driver-standings',
    rows: [
      {
        position: 1,
        driverId: 'max_verstappen',
        driverCode: 'VER',
        driverName: 'Max Verstappen',
        constructorId: 'red_bull',
        constructorName: 'Red Bull',
        points: 575,
        wins: 19,
      },
    ],
  },
  'fs:match-card': {
    type: 'fs:match-card',
    home: 'Arsenal',
    away: 'Chelsea',
    score: '2 – 1',
    competition: 'Premier League · matchday 35',
  },
  'fs:standings-table': {
    type: 'fs:standings-table',
    rows: [
      {
        position: 1,
        team_id: 'arsenal',
        team: { id: 'arsenal', slug: 'arsenal', name: 'Arsenal' },
        competition_slug: 'premier-league',
        season: '2025',
        played: 30,
        won: 22,
        draw: 5,
        lost: 3,
        goals_for: 70,
        goals_against: 24,
        goal_difference: 46,
        points: 71,
      },
    ],
  },
  'fs:team-form-strip': {
    type: 'fs:team-form-strip',
    teamId: 'arsenal',
    fixtures: [
      {
        id: 'arsenal-chelsea-md35',
        competition_slug: 'premier-league',
        season: '2025',
        kickoff_at: '2026-04-21T14:00:00Z',
        status: 'finished',
        home_score: 2,
        away_score: 1,
        home: { id: 'arsenal', slug: 'arsenal', name: 'Arsenal' },
        away: { id: 'chelsea', slug: 'chelsea', name: 'Chelsea' },
      },
    ],
  },
}

const raceCardBody = { body: { foreground: { layers: [SAMPLES['f1:race-card']] } } }
const f1Schema = sectionVisualSchemaFor('deck', undefined, F1_PACK)
const f1Parsed = f1Schema.safeParse(raceCardBody)
check('f1 deck schema accepts f1:race-card', f1Parsed.success, f1Parsed.success ? '' : f1Parsed.error.issues[0]?.message)
if (f1Parsed.success) {
  const norm = normalizeSectionBody(f1Parsed.data.body) as { foreground?: { type?: string } }
  check('normalize keeps the vertical layer', norm.foreground?.type === 'f1:race-card')
}
check('default deck schema rejects f1:race-card', !sectionVisualSchemaFor('deck').safeParse(raceCardBody).success)
check('fs deck schema rejects f1:race-card', !sectionVisualSchemaFor('deck', undefined, FOOTSHORTS_PACK).safeParse(raceCardBody).success)
check(
  'map schema never takes vertical layers',
  !sectionVisualSchemaFor('map', 'text', F1_PACK).safeParse({
    body: { map: { center: [7.42, 43.73], zoom: 12 }, foreground: { layers: [SAMPLES['f1:race-card']] } },
  }).success,
)
const fsBody = { body: { foreground: { layout: 'stat-left-chart-right', regions: [{ name: 'chart', layers: [SAMPLES['fs:standings-table']] }] } } }
check('fs deck schema accepts fs:standings-table in a region', sectionVisualSchemaFor('deck', undefined, FOOTSHORTS_PACK).safeParse(fsBody).success)

// ── 4b. pack hydration stamps app-supplied fields ───────────────────────────
const dsType = F1_PACK.extraLayerTypes.find((t) => t.type === 'f1:driver-standings')!
const dsSample = SAMPLES['f1:driver-standings']!
const dsHydrated = dsType.hydrate
  ? (dsType.hydrate(dsSample) as { rows: Array<{ constructorColor?: string }> })
  : { rows: [] }
check('f1 driver-standings hydrate stamps constructorColor', dsHydrated.rows[0]?.constructorColor === '#3671C6')
check(
  'hydrate does not mutate the input sample',
  (dsSample.rows as Array<{ constructorColor?: string }>)[0]?.constructorColor === undefined,
)

// ── 5. lint isolation ───────────────────────────────────────────────────────
const lintBody = { foreground: SAMPLES['f1:race-card'] as Record<string, unknown> }
check('lint flags a foreign vertical layer', lintSectionBody(lintBody, 'S').some((i) => i.message.includes('f1:race-card')))
check('lint passes with the desk menu', lintSectionBody(lintBody, 'S', { extraTypes: ['f1:race-card'] }).length === 0)
const regionLint = { foreground: { layout: 'stat-left-chart-right', regions: { chart: [SAMPLES['fs:match-card']] } } }
check('lint flags foreign types inside regions', lintSectionBody(regionLint, 'S').some((i) => i.message.includes('fs:match-card')))

// fs:standings-table hardening — a standings beat MUST render as fs:standings-table.
const fsExtra = FOOTSHORTS_PACK.extraLayerTypes.map((t) => t.type)
const standingsAsChart = { foreground: { layout: 'stat-left-chart-right', regions: { chart: [{ type: 'chart', chartId: 'x' }] } } }
check(
  'lint flags a standings beat drawn as a chart',
  lintSectionBody(standingsAsChart, 'The Premier League standings', { extraTypes: fsExtra }).some((i) => i.message.includes('fs:standings-table')),
)
const standingsCorrect = { foreground: { layout: 'stat-left-chart-right', regions: { chart: [SAMPLES['fs:standings-table']] } } }
check(
  'lint passes when the standings beat uses fs:standings-table',
  !lintSectionBody(standingsCorrect, 'The Premier League standings', { extraTypes: fsExtra }).some((i) => i.message.includes('MUST use fs:standings-table')),
)
check(
  'standings rule is scoped to the footshorts desk (no false fire elsewhere)',
  !lintSectionBody(standingsAsChart, 'The Premier League standings').some((i) => i.message.includes('fs:standings-table')),
)
check(
  'standings rule ignores non-standings headings',
  !lintSectionBody(standingsAsChart, 'Goals per matchday', { extraTypes: fsExtra }).some((i) => i.message.includes('fs:standings-table')),
)

// ── 6. anti-drift: zod samples parse through the REAL module parseConfig ────
const MODULE_PATHS: Record<string, string> = {
  'f1:race-card': 'f1-viz/src/modules/race-card',
  'f1:driver-standings': 'f1-viz/src/modules/driver-standings',
  'fs:match-card': 'footshorts-viz/src/modules/match-card',
  'fs:standings-table': 'footshorts-viz/src/modules/standings-table',
  'fs:team-form-strip': 'footshorts-viz/src/modules/team-form-strip',
}

async function antiDrift(packTypes: readonly PackLayerType[]) {
  for (const t of packTypes) {
    const sample = SAMPLES[t.type]
    const rel = MODULE_PATHS[t.type]
    if (!sample || !rel) {
      check(`anti-drift ${t.type}`, false, 'no sample or module path defined')
      continue
    }
    const zodOk = t.schema.safeParse(sample)
    check(`zod accepts ${t.type} sample`, zodOk.success, zodOk.success ? '' : zodOk.error.issues[0]?.message)
    try {
      // File-URL import of the module's clean index (type-only imports + lazy
      // component thunk): the package roots pull viz-engine's React/CSS graph
      // (crashes under node), and the exports maps don't expose the module
      // subpaths. Non-literal, so the stub-based standalone tsc never sees it.
      const path = join(__dirname, '../../../..', 'verticals', rel, 'index.ts')
      const mod = (await import(pathToFileURL(path).href)).default as {
        parseConfig: (raw: unknown, ctx: { slug: string; label: string }) => unknown
      }
      mod.parseConfig(zodOk.success ? zodOk.data : sample, { slug: 'packs-test', label: t.type })
      check(`real parseConfig accepts ${t.type}`, true)
    } catch (e) {
      check(`real parseConfig accepts ${t.type}`, false, e instanceof Error ? e.message : String(e))
    }
  }
}

/** Re-validate one (type, sample) pair: zod mirror accepts it AND the REAL
 *  module parseConfig does too. Used for variants the single SAMPLES map can't
 *  cover (e.g. fs:match-card's grid alongside its single-fixture sample). */
async function antiDriftSample(
  type: string,
  sample: Record<string, unknown>,
  variant: string,
  packTypes: readonly PackLayerType[],
) {
  const t = packTypes.find((x) => x.type === type)
  const rel = MODULE_PATHS[type]
  if (!t || !rel) {
    check(`anti-drift ${type} (${variant})`, false, 'no pack type or module path')
    return
  }
  const zodOk = t.schema.safeParse(sample)
  check(`zod accepts ${type} ${variant} sample`, zodOk.success, zodOk.success ? '' : zodOk.error.issues[0]?.message)
  try {
    const path = join(__dirname, '../../../..', 'verticals', rel, 'index.ts')
    const mod = (await import(pathToFileURL(path).href)).default as {
      parseConfig: (raw: unknown, ctx: { slug: string; label: string }) => unknown
    }
    mod.parseConfig(zodOk.success ? zodOk.data : sample, { slug: 'packs-test', label: `${type} ${variant}` })
    check(`real parseConfig accepts ${type} ${variant}`, true)
  } catch (e) {
    check(`real parseConfig accepts ${type} ${variant}`, false, e instanceof Error ? e.message : String(e))
  }
}

void (async () => {
  await antiDrift(F1_PACK.extraLayerTypes)
  await antiDrift(FOOTSHORTS_PACK.extraLayerTypes)
  // fs:match-card grid — the multi-fixture variant the single-card SAMPLE can't reach.
  await antiDriftSample(
    'fs:match-card',
    {
      type: 'fs:match-card',
      layout: 'grid',
      columns: 2,
      cards: [
        { home: 'Arsenal', away: 'Chelsea', score: '2 – 1', competition: 'Premier League' },
        { home: 'Liverpool', away: 'Man City', score: '1 – 1' },
      ],
    },
    'grid',
    FOOTSHORTS_PACK.extraLayerTypes,
  )
  console.log(failed ? '\n✗ FAILURES above' : '\n✓ all pack checks passed')
  if (failed) process.exitCode = 1
})()
