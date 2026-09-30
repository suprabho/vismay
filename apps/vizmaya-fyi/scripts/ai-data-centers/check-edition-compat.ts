/**
 * Backward-compatibility check for the daily edition's "Still developing"
 * block (dc_editions.continuing, migration 084).
 *
 * The code has to keep working in every state it can meet in production:
 *
 *   - the code deployed before migration 084 is applied (no `continuing`
 *     column: reads and writes fall back to the pre-084 column list);
 *   - editions published before the feature (no `continuing` value, and
 *     published rows are frozen, so they are never backfilled);
 *   - composer runs stored on a draft before the feature (their `text` has
 *     no `continuing` key, and the admin diffs against them);
 *   - editor edits that name a `continuing.N` item the next recompose no
 *     longer has;
 *   - callers of deterministicText that pass no carry-over threads, and
 *     prior-edition stories classified before v4 (no event line / actors).
 *
 * Two parts:
 *
 *   OFFLINE (always runs, no env): drives the real fallback code with the
 *     exact errors PostgREST returns for a missing column, and the real
 *     mappers / text helpers with pre-084 shapes.
 *   LIVE (runs when the Supabase env is present, read-only): probes whether
 *     084 is applied, reads recent editions through the public readers,
 *     checks every stored `continuing` item and every stored composer run,
 *     and dry-runs the carry-over check on the latest edition. Never writes.
 *
 * Run:  pnpm ai-data-centers:check-compat
 *       pnpm ai-data-centers:check-compat -- --offline        (skip the DB)
 *       pnpm ai-data-centers:check-compat -- --limit 60       (editions to read)
 *
 * Exits 1 on any failure, so it can gate a deploy.
 */

import assert from 'node:assert/strict'
import { config as loadEnv } from 'dotenv'
import {
  EDITION_COLUMNS,
  EDITION_COLUMNS_PRE_084,
  getDraftEdition,
  getEditionForAdmin,
  getLatestEdition,
  isMissingContinuing,
  listEditionsForAdmin,
  listPriorEditions,
  mapEditionRow,
  withEditionColumns,
} from '@vismay/content-source/dcEditions'
import {
  EDITABLE_PATH_RE,
  buildIdf,
  deterministicText,
  findCarryOvers,
  flattenText,
  overlayEditedFields,
} from '@vismay/content-source/dcEditionAssembly'
import type { DcEditionStory, EditionContinuing, EditionText } from '@vismay/content-source/dcEditionTypes'
import { createServiceClient } from '@vismay/content-source/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

// ---------------------------------------------------------------------------
// Harness

let failed = 0
let passed = 0
const warnings: string[] = []

async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message.split('\n').join('\n      ') : String(err)}`)
  }
}

function warn(msg: string): void {
  warnings.push(msg)
  console.log(`  ! ${msg}`)
}

// The errors PostgREST actually returns when the column is missing.
const MISSING_ON_SELECT = { code: '42703', message: 'column dc_editions.continuing does not exist' }
const MISSING_ON_WRITE = { code: 'PGRST204', message: "Could not find the 'continuing' column of 'dc_editions' in the schema cache" }

/** A dc_editions row as the table held it before migration 084. */
function pre084Row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'e-old',
    number: 7,
    edition_date: '2026-09-25',
    status: 'published',
    headline: 'An edition from before Still developing',
    sub: 'Its deck.',
    counts: { stories: 2 },
    mood_score: 0.2,
    published_at: '2026-09-25T09:00:00Z',
    window_start: '2026-09-24T06:15:00Z',
    window_end: '2026-09-25T06:15:00Z',
    notes: [],
    mood_counts: { boom: 1, doom: 0, neutral: 1 },
    mood_series: [],
    layers: {},
    research: {},
    energy: {},
    geo: {},
    tape: [],
    charts: {},
    chart_skips: [],
    story_ids: [1, 2],
    paper_ids: [],
    iea_ids: [],
    model: 'anthropic/claude-opus-5.5',
    classifier_version: 'v4-events-2026-09',
    composer_runs: [],
    edited_fields: [],
    auto_publish_at: null,
    hold_count: 0,
    generated_at: '2026-09-25T06:40:00Z',
    reviewed_by: null,
    ...over,
  }
}

/** Prose as composer runs stored it before the feature: no `continuing` key. */
function pre084Text(): EditionText {
  const layer = { headline: 'h', sub: 's', notes: [{ text: 'n', sources: [{ name: 'A', url: 'https://a.example/1' }] }] }
  return {
    headline: 'Old headline',
    sub: 'Old deck.',
    notes: [{ metric: '1', unit: 'GW', label: 'l', text: 't', sources: [{ name: 'A', url: 'https://a.example/1' }], energy: false }],
    layers: { dc: layer, hyper: layer, semi: layer, equip: layer },
    research: { headline: 'r', sub: 'rs' },
  } as unknown as EditionText
}

const story = (id: number, title: string, over: Partial<DcEditionStory> = {}): DcEditionStory => ({
  id,
  url: `https://news.example/${id}`,
  title,
  summary: null,
  source: `Outlet ${id}`,
  publishedAt: '2026-09-25T02:00:00Z',
  topics: ['data-centers'],
  tickers: [],
  layer: 'dc',
  place: null,
  region: null,
  theme: 'capacity',
  mood: 1,
  energy: false,
  facts: { action: 'other', figures: [], horizon: null },
  kind: 'news',
  ...over,
})

// ---------------------------------------------------------------------------
// Offline

async function offline(): Promise<void> {
  console.log('\nOffline — the fallback paths, driven with pre-084 shapes')

  await check('the column lists differ only by `continuing`', () => {
    assert.equal(EDITION_COLUMNS, `${EDITION_COLUMNS_PRE_084}, continuing`)
    assert.ok(!/continuing/.test(EDITION_COLUMNS_PRE_084))
  })

  await check('PostgREST "missing column" errors are recognised, others are not', () => {
    assert.ok(isMissingContinuing(MISSING_ON_SELECT), 'select: 42703')
    assert.ok(isMissingContinuing(MISSING_ON_WRITE), 'insert/update: PGRST204')
    assert.ok(!isMissingContinuing({ code: '42501', message: 'permission denied for table dc_editions' }))
    assert.ok(!isMissingContinuing({ code: 'PGRST204', message: "Could not find the 'charts' column of 'dc_editions' in the schema cache" }))
    assert.ok(!isMissingContinuing(null))
  })

  await check('read before 084: retries once with the pre-084 list', async () => {
    const calls: { cols: string; full: boolean }[] = []
    const res = await withEditionColumns(async (cols, full) => {
      calls.push({ cols, full })
      return cols.includes('continuing') ? { data: null, error: MISSING_ON_SELECT } : { data: pre084Row(), error: null }
    })
    assert.equal(res.error, null)
    assert.deepEqual(calls.map((c) => [c.cols, c.full]), [[EDITION_COLUMNS, true], [EDITION_COLUMNS_PRE_084, false]])
  })

  await check('write before 084: the retry is told to drop the `continuing` value', async () => {
    const written: Record<string, unknown>[] = []
    const row = { headline: 'h', continuing: [] as EditionContinuing[] }
    const res = await withEditionColumns(async (_cols, full) => {
      const values: Record<string, unknown> = { ...row }
      if (!full) delete values.continuing
      written.push(values)
      return 'continuing' in values ? { data: null, error: MISSING_ON_WRITE } : { data: { id: 'x' }, error: null }
    })
    assert.equal(res.error, null)
    assert.equal(written.length, 2)
    assert.ok(!('continuing' in written[1]), 'second attempt carries no continuing key')
  })

  await check('after 084: one call, full column list, nothing dropped', async () => {
    const calls: boolean[] = []
    const res = await withEditionColumns(async (_cols, full) => {
      calls.push(full)
      return { data: pre084Row({ continuing: [] }), error: null }
    })
    assert.equal(res.error, null)
    assert.deepEqual(calls, [true])
  })

  await check('an unrelated error is surfaced, not retried away', async () => {
    let n = 0
    const res = await withEditionColumns(async () => {
      n++
      return { data: null, error: { code: '42501', message: 'permission denied' } }
    })
    assert.equal(n, 1)
    assert.equal(res.error?.code, '42501')
  })

  await check('an edition row without `continuing` (or null) maps to []', () => {
    assert.deepEqual(mapEditionRow(pre084Row()).continuing, [])
    assert.deepEqual(mapEditionRow(pre084Row({ continuing: null })).continuing, [])
    const item: EditionContinuing = { label: 'L', text: 'T', since: '2026-09-24', sources: [{ name: 'A', url: 'https://a.example/1' }] }
    assert.deepEqual(mapEditionRow(pre084Row({ continuing: [item] })).continuing, [item])
  })

  await check('a composer run stored before the feature still flattens for the admin diff', () => {
    const flat = flattenText(pre084Text())
    assert.equal(flat.headline, 'Old headline')
    assert.ok(!Object.keys(flat).some((k) => k.startsWith('continuing.')))
  })

  await check('edited paths: the old ones still match, the new ones are accepted', () => {
    for (const p of ['headline', 'sub', 'notes.0.metric', 'layers.dc.notes.2.sources', 'research.sub']) assert.ok(EDITABLE_PATH_RE.test(p), p)
    for (const p of ['continuing.0.label', 'continuing.4.text', 'continuing.1.sources']) assert.ok(EDITABLE_PATH_RE.test(p), p)
    assert.ok(!EDITABLE_PATH_RE.test('continuing.0.since'), 'since is derived, never edited')
  })

  await check('a recompose keeps edits when the current draft predates `continuing`', () => {
    const next = { ...pre084Text(), headline: 'New', continuing: [{ label: 'L', text: 'T', since: '2026-09-24', sources: [] }] }
    const current = { ...pre084Text(), headline: 'Edited' }
    const out = overlayEditedFields(next, current, ['headline', 'continuing.0.text'])
    assert.equal(out.headline, 'Edited')
    assert.equal(out.continuing[0].text, 'T', 'no value to carry over, so the new run stands')
  })

  await check('an edit to a thread the new run no longer has is skipped, not half-rebuilt', () => {
    const next = { ...pre084Text(), continuing: [] as EditionContinuing[] }
    const current = { ...pre084Text(), continuing: [{ label: 'L', text: 'Edited', since: '2026-09-24', sources: [] }] }
    const out = overlayEditedFields(next, current, ['continuing.0.text'])
    assert.deepEqual(out.continuing, [])
  })

  await check('deterministicText without threads (older callers) behaves as before', () => {
    const stories = [
      story(1, 'Oracle adds 1.2 GW in Abilene', { facts: { action: 'add', figures: [{ value: 1.2, unit: 'GW', label: 'capacity' }], horizon: null } }),
      story(2, 'Loudoun defers a rezoning', { mood: -1, theme: 'permit' }),
    ]
    const withThreads = deterministicText({ stories, papers: [], places: new Map(), threads: [] })
    const without = deterministicText({ stories, papers: [], places: new Map() })
    assert.deepEqual(without, withThreads)
    assert.deepEqual(without.continuing, [])
  })

  await check('prior editions of pre-v4 stories (no event line, no actors) are handled', () => {
    const prior = [{ date: '2026-09-24', headline: '', sub: '', notes: [], stories: [story(10, 'Samsung invests $1 billion in Helix', { publishedAt: '2026-09-24T02:00:00Z' })] }]
    const today = [story(11, 'Samsung invests $1 billion in Helix'), story(12, 'Loudoun defers a rezoning', { mood: -1 })]
    const threads = findCarryOvers(today, prior, { idf: buildIdf([...prior[0].stories, ...today]) })
    assert.equal(threads.length, 1)
    assert.deepEqual(threads[0].storyIds, [11])
    assert.deepEqual(findCarryOvers(today, []), [], 'no earlier editions: nothing carried')
  })
}

// ---------------------------------------------------------------------------
// Live (read-only)

const DATE = /^\d{4}-\d{2}-\d{2}$/

async function live(limit: number): Promise<void> {
  console.log('\nLive — read-only, against the configured Supabase')
  const sb = createServiceClient()

  const probe = await sb.from('dc_editions').select('continuing').limit(1)
  const applied = !probe.error
  if (probe.error && !isMissingContinuing(probe.error)) throw new Error(`probe failed: ${probe.error.message}`)
  console.log(`  migration 084: ${applied ? 'applied' : 'NOT applied — every read below goes through the pre-084 fallback'}`)

  const summaries = await listEditionsForAdmin(limit)
  console.log(`  reading ${summaries.length} editions (${summaries.filter((s) => s.status === 'published').length} published)`)

  let withBlock = 0
  let runs = 0
  for (const s of summaries) {
    await check(`${s.date} (${s.status}) reads and its block is well-formed`, async () => {
      const e = await getEditionForAdmin(s.date)
      assert.ok(e, 'reader returned nothing')
      assert.ok(Array.isArray(e.continuing), 'continuing is not an array')
      if (!applied) assert.equal(e.continuing.length, 0, 'pre-084 read produced items')
      if (e.continuing.length > 0) withBlock++
      const urls = new Set([...e.stories, ...e.ieaStories].map((x) => x.url))
      e.continuing.forEach((c, i) => {
        assert.ok(typeof c.label === 'string' && c.label.trim(), `continuing.${i}: empty label`)
        assert.ok(typeof c.text === 'string' && c.text.trim(), `continuing.${i}: empty text`)
        assert.ok(DATE.test(c.since), `continuing.${i}: since "${c.since}" is not a date`)
        assert.ok(c.since < e.date, `continuing.${i}: since ${c.since} is not before the edition`)
        assert.ok(Array.isArray(c.sources) && c.sources.length > 0, `continuing.${i}: no sources`)
        const stray = c.sources.filter((src) => !urls.has(src.url))
        if (stray.length) warn(`${e.date} continuing.${i}: ${stray.length} source(s) not in the edition's membership (dropped by an editor?)`)
      })
      // Every stored composer run, including those written before the feature.
      for (const run of e.composerRuns) {
        runs++
        flattenText(run.text)
      }
    })
  }

  await check('getLatestEdition reads', async () => {
    const latest = await getLatestEdition()
    if (latest) assert.ok(Array.isArray(latest.continuing))
  })

  await check('getDraftEdition reads (null is fine)', async () => {
    const draft = await getDraftEdition()
    if (draft) assert.ok(Array.isArray(draft.continuing))
  })

  const latest = summaries.find((s) => s.status === 'published') ?? summaries[0]
  if (latest) {
    await check(`carry-over dry run on ${latest.date} (no writes)`, async () => {
      const [e, prior] = await Promise.all([getEditionForAdmin(latest.date), listPriorEditions(latest.date, { limit: 3 })])
      assert.ok(e)
      const idf = buildIdf([...prior.flatMap((p) => p.stories), ...e.stories])
      const threads = findCarryOvers(e.stories, prior, { idf })
      const carried = threads.reduce((n, t) => n + t.storyIds.length, 0)
      console.log(
        `      against ${prior.map((p) => p.date).join(', ') || 'no earlier editions'}: ${carried} of ${e.stories.length} stories would be carried over in ${threads.length} threads`,
      )
    })
  }

  console.log(`  ${withBlock} edition(s) carry a Still developing block · ${runs} stored composer run(s) flattened`)
}

// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--')
  const offlineOnly = argv.includes('--offline')
  const li = argv.indexOf('--limit')
  const limit = li >= 0 ? Number(argv[li + 1]) : 30
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`Invalid --limit: ${argv[li + 1]}`)

  await offline()
  const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (offlineOnly) console.log('\nLive — skipped (--offline)')
  else if (!hasEnv) console.log('\nLive — skipped (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)')
  else await live(limit)

  console.log(`\n${failed === 0 ? 'OK' : 'FAILED'} — ${passed} passed, ${failed} failed${warnings.length ? `, ${warnings.length} warning(s)` : ''}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
