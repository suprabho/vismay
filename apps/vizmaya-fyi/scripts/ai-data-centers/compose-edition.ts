/**
 * AI Data Centers daily snapshot — the edition composer.
 *
 * Replaces the markdown recap worker (generate-news-recap.ts). Once a day it
 * takes the window's relevant dc_news stories (with their snapshot tags and
 * extracted facts), the kept arXiv papers, the tracked stocks' latest moves
 * and any data-centre stories from iea_news, and writes ONE structured draft
 * row into dc_editions — the row the public page renders.
 *
 * Hybrid, like the recap worker before it: a model (Claude Opus through the
 * Vercel AI Gateway by default) writes the prose layer (headline, deck, six
 * key notes, per-layer headline / sub / notes, research headline / sub) as
 * typed JSON. Everything numeric — mood score and counts, geo pins and
 * region bars, the four per-layer visualisations, the energy figures and
 * composition, the field baselines, the tape — is assembled
 * deterministically from the tagged rows (packages/content-source/src/
 * dcEditionAssembly.ts), never by the model, and every note's lead number is
 * checked against the stories it cites. On any model failure the composer
 * falls back to a deterministic edition (headline from the top theme's lead
 * story, notes from the largest stated figures) and marks
 * model = 'deterministic', so the cron never goes dark.
 *
 * A second model pass plans one chart per section (energy + the four AI
 * layers) from the figures the stories state — a flint spec, grounded row
 * by row against the cited story, compiled and rendered to SVG here
 * (editionCharts.ts) and stored on the row. A section whose plan is refused
 * keeps its deterministic template. --charts-only re-plans the charts on the
 * existing draft and leaves prose, numbers and edits alone (the admin's
 * "Regenerate charts").
 *
 * Editor edits on an existing draft survive a recompose unless
 * --clear-edits is passed; every run is appended to composer_runs so the
 * admin can diff the current text against the previous run.
 *
 * Run locally:  pnpm ai-data-centers:compose-edition
 *               pnpm ai-data-centers:compose-edition -- --date 2026-09-22
 *               pnpm ai-data-centers:compose-edition -- --dry-run --out edition.json
 *               pnpm ai-data-centers:compose-edition -- --clear-edits
 *               pnpm ai-data-centers:compose-edition -- --charts-only
 *               pnpm ai-data-centers:compose-edition -- --no-charts
 * Run in CI:    .github/workflows/compose-dc-edition.yml (08:15 UTC daily)
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — read dc_news / dc_papers /
 *     dc_places / dc_stocks / dc_stock_prices / iea_news, write dc_editions
 *   AI_GATEWAY_API_KEY   — optional; enables the prose layer and the chart planner
 *   COMPOSER_MODEL       — optional override: a `text.*` alias or a gateway id (default text.opus)
 *   COMPOSER_CHART_MODEL — optional override for the chart planner only (default = COMPOSER_MODEL)
 *   ADMIN_SESSION_SECRET — optional; signs the revalidate ping when a stale
 *     draft gets published on the way in
 */

import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import { config as loadEnv } from 'dotenv'
import { generateText as gatewayGenerateText } from '@vismay/ai-gateway'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  assembleEditionNumbers,
  getDraftEdition,
  listDcNewsTagged,
  listDcPapersInWindow,
  listDcPlaces,
  listIeaNewsForEditionWindow,
  publishStaleDrafts,
  saveDraftCharts,
  upsertDraftEdition,
} from '@vismay/content-source/dcEditions'
import { EDITION_CHART_SECTIONS, type EditionChartSkip, type EditionCharts } from '@vismay/content-source/dcEditionTypes'
import { chartPlannerModel, planEditionCharts } from './editionCharts'
import { getDcStockMarket, listDataCenters } from '@vismay/content-source/epics'
import {
  DC_LAYERS,
  DC_LAYER_KEYS,
  DC_PAPER_AREAS,
  DC_REGIONS,
  DC_THEMES,
  editionDateFor,
  editionWindow,
  type DcEditionStory,
  type DcPaper,
  type DcPlace,
  type EditionLayerNote,
  type EditionNote,
  type EditionText,
} from '@vismay/content-source/dcEditionTypes'
import {
  deterministicText,
  groundNoteMetric,
  paperGainText,
  sourcesFromIdxs,
} from '@vismay/content-source/dcEditionAssembly'
import { pingEditionRevalidate } from './revalidate'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

/** A `text.*` alias from @vismay/ai-gateway MODELS or a raw gateway id; opus is the editorial default. */
const COMPOSER_MODEL = process.env.COMPOSER_MODEL || 'text.opus'
/** Ceiling on stories handed to the model — a busy day lands well under it. */
const MAX_STORIES = 150
/** Papers per edition: the gate's top scorers, newest first among ties. */
const MAX_PAPERS = 8
const NOTE_COUNT = 6
const LAYER_NOTE_COUNT = 3

interface Args {
  date: string
  dryRun: boolean
  clearEdits: boolean
  /** Re-plan the charts on the existing draft; prose, numbers and edits untouched. */
  chartsOnly: boolean
  /** Skip the chart planner (templates only). */
  noCharts: boolean
  out: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { date: editionDateFor(new Date()), dryRun: false, clearEdits: false, chartsOnly: false, noCharts: false, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') continue
    if (a === '--date') {
      const d = argv[++i]
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d ?? '')) throw new Error(`Invalid --date value: ${d}`)
      args.date = d
    } else if (a === '--dry-run') args.dryRun = true
    else if (a === '--clear-edits') args.clearEdits = true
    else if (a === '--charts-only') args.chartsOnly = true
    else if (a === '--no-charts') args.noCharts = true
    else if (a === '--out') args.out = argv[++i] ?? 'edition.json'
    else throw new Error(`Unknown flag: ${a}`)
  }
  if (args.chartsOnly && args.noCharts) throw new Error('--charts-only and --no-charts contradict each other')
  return args
}

// ---------------------------------------------------------------------------
// Prose layer (opus through the AI gateway)

const COMPOSER_SYSTEM = `You are the editor of "AI Data Centers Daily", a frozen morning edition for operators, investors, analysts and policy people who need to know what happened in AI infrastructure yesterday, from every angle, with every claim traceable to a source.

You receive the window's stories (each with an idx, outlet, layer, place, theme, mood, energy flag, tickers and the FACTS the story states), the kept research papers, the tracked stocks' moves and a few numbers the page already computes. You write the prose layer only; the page computes every chart and count itself.

Write in a plain, specific, newsroom register: no hype, no opinion, no adjectives that are not in the reporting. British or American spelling is fine; be consistent. Never invent facts, numbers, quotes, names or events. Every number you write must appear in the stories you cite for that sentence.

Respond with JSON in this exact shape:
{
  "headline": "The 24-hour headline: one sentence, ≤ 18 words, naming the day's biggest development and, if there is one, the tension beneath it.",
  "sub": "The deck: 2–3 sentences that carry the secondary threads. Mark one clause to emphasise with *asterisks*.",
  "notes": [
    {
      "metric": "the number that matters, as text ('4.6', '2027', 'High-NA'); null when the note has no lead figure",
      "unit": "'GW', 'MW', '%', null …",
      "label": "3–8 words under the number ('power committed in three deals')",
      "text": "2–3 sentences. Start with the takeaway in bold-worthy plain words, then the specifics with outlets' facts.",
      "sourceIdxs": [0, 5],
      "energy": false
    }
  ],
  "layers": {
    "dc":    { "headline": "≤ 14 words on what moved in data-center sites and capacity", "sub": "1–2 sentences", "notes": [ { "text": "one sentence, specific", "sourceIdxs": [2] } ] },
    "hyper": { "headline": "…", "sub": "…", "notes": [ … ] },
    "semi":  { "headline": "…", "sub": "…", "notes": [ … ] },
    "equip": { "headline": "…", "sub": "…", "notes": [ … ] }
  },
  "research": {
    "headline": "≤ 16 words on the day in AI research, on its own terms",
    "sub": "2–3 sentences: the largest gains, what was released or closed, the audit or benchmark story if there is one."
  }
}

Rules:
- Exactly 6 notes, most important first. Each cites 1–3 story idx values from the input and is led by a number one of those stories states — or has metric null. The sixth note is the sustainability / energy note when the window has one (energy: true).
- Each layer: exactly 3 notes when the layer has 3 or more stories, fewer when it has fewer, none when it has none (then headline: "No <layer> stories in this window", sub: ""). Layer notes cite only stories tagged with that layer.
- sourceIdxs must be idx values from the input, nothing else.
- Use the FACTS fields (figures, horizon, action) as the numbers; do not compute new ones.
- research: write from the papers list only; if it is empty say so plainly.`

const modelNoteSchema = z.object({
  metric: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  label: z.string().optional(),
  text: z.string(),
  sourceIdxs: z.array(z.number().int()),
  energy: z.boolean().optional(),
})

const modelLayerSchema = z.object({
  headline: z.string(),
  sub: z.string(),
  notes: z.array(z.object({ text: z.string(), sourceIdxs: z.array(z.number().int()) })),
})

/** The prose layer, typed: the gateway constrains the model to this at the provider level. */
const proseSchema = z.object({
  headline: z.string(),
  sub: z.string(),
  notes: z.array(modelNoteSchema),
  layers: z.object({ dc: modelLayerSchema, hyper: modelLayerSchema, semi: modelLayerSchema, equip: modelLayerSchema }),
  research: z.object({ headline: z.string(), sub: z.string() }),
})

interface ModelNote {
  metric?: unknown
  unit?: unknown
  label?: unknown
  text?: unknown
  sourceIdxs?: unknown
  energy?: unknown
}

interface ModelLayer {
  headline?: unknown
  sub?: unknown
  notes?: unknown
}

interface ModelOutput {
  headline?: unknown
  sub?: unknown
  notes?: unknown
  layers?: Record<string, ModelLayer>
  research?: { headline?: unknown; sub?: unknown }
}

function buildComposerInput(input: {
  editionDate: string
  windowLabel: string
  stories: DcEditionStory[]
  ieaStories: DcEditionStory[]
  papers: DcPaper[]
  places: Map<string, DcPlace>
  numbers: Awaited<ReturnType<typeof assembleEditionNumbers>>
}): unknown {
  const { stories, ieaStories, papers, places, numbers } = input
  return {
    edition: input.editionDate,
    window: input.windowLabel,
    computed: {
      moodScore: numbers.moodScore,
      moodCounts: numbers.moodCounts,
      storiesByLayer: numbers.layerCounts,
      topPlaces: numbers.geo.places.slice(0, 6).map((p) => `${p.name} (${p.count})`),
      powerCommittedGw: numbers.energy.hero?.value ?? 0,
      energyStories: numbers.energy.storyCount,
      largestMoves: numbers.tape.slice(0, 4).concat(numbers.tape.slice(-3)).map((t) => `${t.ticker} ${t.changePct > 0 ? '+' : ''}${t.changePct}%`),
    },
    stories: stories.map((s, idx) => ({
      idx,
      headline: s.title,
      summary: s.summary?.slice(0, 400) ?? null,
      outlet: s.source,
      publishedAt: s.publishedAt,
      layer: s.layer ? DC_LAYERS[s.layer].name : null,
      layerKey: s.layer,
      place: s.place ? (places.get(s.place)?.name ?? s.place) : null,
      region: s.region ? DC_REGIONS[s.region] : null,
      theme: s.theme ? DC_THEMES[s.theme].name : null,
      mood: s.mood === 1 ? 'boom' : s.mood === -1 ? 'doom' : 'neutral',
      energy: s.energy,
      tickers: s.tickers,
      facts: s.facts,
    })),
    ieaStories: ieaStories.map((s) => ({ headline: s.title, summary: s.summary?.slice(0, 300) ?? null, publishedAt: s.publishedAt })),
    papers: papers.map((p, idx) => ({
      idx,
      arxivId: p.arxivId,
      title: p.title,
      area: p.area ? DC_PAPER_AREAS[p.area] : null,
      affiliations: p.affiliations,
      kind: p.kind,
      result: p.bench ? `${paperGainText(p)} on ${p.bench}` : null,
      scale: p.scale,
      released: p.weightsReleased ? 'weights + code' : p.codeReleased ? 'code only' : 'nothing yet',
      why: p.why,
    })),
  }
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * Turn the model's JSON into a valid EditionText: resolve sourceIdxs to real
 * sources, ground every note's metric in its cited stories, enforce the
 * counts, and pad anything missing from the deterministic edition.
 */
function validateModelText(out: ModelOutput, stories: DcEditionStory[], fallback: EditionText): EditionText | null {
  const headline = str(out.headline, 220)
  const sub = str(out.sub, 700)
  if (!headline || !sub) return null

  const notes: EditionNote[] = []
  for (const raw of Array.isArray(out.notes) ? (out.notes as ModelNote[]) : []) {
    if (!raw || typeof raw !== 'object') continue
    const text = str(raw.text, 900)
    const sources = sourcesFromIdxs(raw.sourceIdxs, stories)
    if (!text || sources.length === 0) continue
    const cited = stories.filter((s) => sources.some((src) => src.url === s.url))
    const draft: EditionNote = {
      metric: typeof raw.metric === 'string' ? str(raw.metric, 24) || null : null,
      unit: typeof raw.unit === 'string' ? str(raw.unit, 16) || null : null,
      label: str(raw.label, 140) || (cited[0]?.theme ? DC_THEMES[cited[0].theme].name : 'as stated'),
      text,
      sources,
      energy: raw.energy === true || cited.every((s) => s.energy),
    }
    const grounded = groundNoteMetric(draft, cited)
    notes.push({ ...draft, metric: grounded.metric, unit: grounded.metric ? grounded.unit : null })
    if (notes.length === NOTE_COUNT) break
  }
  // Pad from the deterministic notes, skipping sources already used.
  for (const n of fallback.notes) {
    if (notes.length >= NOTE_COUNT) break
    if (notes.some((x) => x.sources[0]?.url === n.sources[0]?.url)) continue
    notes.push(n)
  }

  const layers = {} as EditionText['layers']
  for (const k of DC_LAYER_KEYS) {
    const raw = out.layers?.[k]
    const inLayer = stories.filter((s) => s.layer === k)
    const layerNotes: EditionLayerNote[] = []
    for (const rn of Array.isArray(raw?.notes) ? (raw!.notes as ModelNote[]) : []) {
      if (!rn || typeof rn !== 'object') continue
      const text = str(rn.text, 700)
      // Layer notes cite only stories in that layer.
      const sources = sourcesFromIdxs(rn.sourceIdxs, stories).filter((src) => inLayer.some((s) => s.url === src.url))
      if (!text || sources.length === 0) continue
      layerNotes.push({ text, sources })
      if (layerNotes.length === LAYER_NOTE_COUNT) break
    }
    for (const n of fallback.layers[k].notes) {
      if (layerNotes.length >= Math.min(LAYER_NOTE_COUNT, inLayer.length)) break
      if (layerNotes.some((x) => x.sources[0]?.url === n.sources[0]?.url)) continue
      layerNotes.push(n)
    }
    layers[k] = {
      headline: str(raw?.headline, 220) || fallback.layers[k].headline,
      sub: str(raw?.sub, 700) || fallback.layers[k].sub,
      notes: layerNotes,
    }
  }

  return {
    headline,
    sub,
    notes,
    layers,
    research: {
      headline: str(out.research?.headline, 220) || fallback.research.headline,
      sub: str(out.research?.sub, 700) || fallback.research.sub,
    },
  }
}

function gatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
}

async function generateText(
  input: unknown,
  stories: DcEditionStory[],
  fallback: EditionText,
): Promise<{ text: EditionText; model: string } | null> {
  if (!gatewayConfigured()) {
    console.warn('[compose] AI_GATEWAY_API_KEY not set — deterministic edition')
    return null
  }
  try {
    const res = await gatewayGenerateText({
      model: COMPOSER_MODEL,
      system: COMPOSER_SYSTEM,
      prompt: `Write the edition for this window:\n${JSON.stringify(input, null, 1)}`,
      schema: proseSchema,
      temperature: 0.35,
      maxOutputTokens: 8000,
      metadata: { 'x-vismay-feature': 'dc-edition-prose' },
    })
    const text = validateModelText(res.result as ModelOutput, stories, fallback)
    if (!text) {
      console.warn('[compose] model output missing headline/sub — deterministic edition')
      return null
    }
    return { text, model: res.modelUsed || COMPOSER_MODEL }
  } catch (err) {
    console.warn(`[compose] prose generation failed (${err instanceof Error ? err.message : String(err)}) — deterministic edition`)
    return null
  }
}

/** One line per section for the log and the dry run. */
function describeCharts(charts: EditionCharts, skips: EditionChartSkip[]): string {
  return EDITION_CHART_SECTIONS.map((k) => {
    const c = charts[k]
    if (c) return `${k}: rung ${c.rung ?? 1} · ${c.spec.chartType} · ${c.spec.rows.length} rows · "${c.title}"`
    const skip = skips.find((s) => s.section === k)
    return `${k}: template (${skip?.reason ?? 'no plan'})`
  }).join('\n  ')
}

/** Epoch's facility register for rung-4 charts; an unavailable table just means no facility chart. */
async function facilitiesForCharts() {
  try {
    return await listDataCenters()
  } catch (err) {
    console.warn(`[charts] dc_facilities unavailable (${err instanceof Error ? err.message : err}) — no facility chart`)
    return []
  }
}

/** The tracked stocks' close series over the trailing month, for the line and slope charts; unavailable → bars from the tape. */
async function marketForCharts() {
  try {
    return await getDcStockMarket(30)
  } catch (err) {
    console.warn(`[charts] dc_stock_prices unavailable (${err instanceof Error ? err.message : err}) — bars from the tape only`)
    return undefined
  }
}

/**
 * --charts-only: re-plan the charts on the current draft from the stories it
 * already carries. Prose, numbers, membership and editor edits stay as they
 * are; only the charts column is rewritten.
 */
async function rePlanCharts(args: Args): Promise<void> {
  const draft = await getDraftEdition()
  if (!draft) throw new Error('no draft edition to re-plan charts for')
  if (draft.date !== args.date) console.warn(`[compose] draft is for ${draft.date}, not ${args.date} — re-planning the draft`)
  console.log(`[compose] re-planning charts for ${draft.date} from ${draft.stories.length} stories + ${draft.ieaStories.length} iea items`)
  const { charts, skips, modelUsed } = await planEditionCharts({
    stories: draft.stories,
    ieaStories: draft.ieaStories,
    papers: draft.papers,
    tape: draft.tape,
    market: await marketForCharts(),
    perEdition: draft.energy.perEdition,
    fieldBaseline: draft.research.fieldBaseline,
    facilities: await facilitiesForCharts(),
    model: chartPlannerModel(),
    log: (l) => console.log(l),
  })
  console.log(`  ${describeCharts(charts, skips)}`)
  if (args.dryRun) {
    if (args.out) writeFileSync(args.out, JSON.stringify({ charts, skips }, null, 2), 'utf8')
    return
  }
  await saveDraftCharts({ editionDate: draft.date, charts, chartSkips: skips })
  const rungs = Object.values(charts).map((c) => c.rung ?? 1)
  console.log(
    `[compose] charts written · model=${modelUsed ?? 'record only'} · ${rungs.length} charts (${rungs.filter((r) => r === 1).length} from today's figures, ${rungs.filter((r) => r === 4).length} from the record) · ${EDITION_CHART_SECTIONS.length - rungs.length} on templates`,
  )
}

// ---------------------------------------------------------------------------
// Main

/** Papers already carried by recent editions, so a paper appears once. */
async function recentlyUsedPaperIds(beforeDate: string): Promise<Set<string>> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_editions')
    .select('paper_ids')
    .lt('edition_date', beforeDate)
    .order('edition_date', { ascending: false })
    .limit(3)
  if (error) throw new Error(`recentlyUsedPaperIds: ${error.message}`)
  const used = new Set<string>()
  for (const r of (data ?? []) as { paper_ids: string[] | null }[]) for (const id of r.paper_ids ?? []) used.add(id)
  return used
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { start, end } = editionWindow(args.date)
  const windowLabel = `${start.toISOString().slice(0, 16).replace('T', ' ')} → ${end.toISOString().slice(0, 16).replace('T', ' ')} UTC`
  console.log(`[compose] edition ${args.date} · window ${windowLabel}${args.dryRun ? ' (dry)' : ''}`)

  if (args.chartsOnly) {
    await rePlanCharts(args)
    return
  }

  if (!args.dryRun) {
    // One draft at a time: a draft that never got its 09:00 publish (a job
    // failure, an endless hold) goes public now — its review window is over.
    for (const stale of await publishStaleDrafts(args.date)) {
      console.log(`[compose] published stale draft ${stale.date} as edition ${stale.number}`)
      await pingEditionRevalidate(stale.date)
    }
  }

  const [stories, ieaStories, places, used] = await Promise.all([
    listDcNewsTagged({ start: start.toISOString(), end: end.toISOString(), limit: MAX_STORIES }),
    listIeaNewsForEditionWindow({ start: start.toISOString(), end: end.toISOString() }).catch((err) => {
      console.warn(`[compose] iea_news unavailable (${err instanceof Error ? err.message : err})`)
      return [] as DcEditionStory[]
    }),
    listDcPlaces(),
    recentlyUsedPaperIds(args.date),
  ])
  const untagged = stories.filter((s) => !s.layer).length
  console.log(`[compose] ${stories.length} relevant stories (${untagged} untagged) · ${ieaStories.length} iea_news items`)
  if (untagged > 0) console.warn('[compose] untagged rows in the window — run the scraper with --backfill-days to tag them')

  // arXiv announces a day after submission; look back a little further than
  // the news window and let the recent-editions filter dedupe.
  const paperStart = new Date(start.getTime() - 12 * 3_600_000).toISOString()
  const papers = (await listDcPapersInWindow({ start: paperStart, end: end.toISOString(), limit: 40 }).catch((err) => {
    console.warn(`[compose] dc_papers unavailable (${err instanceof Error ? err.message : err}) — empty research chapter`)
    return [] as DcPaper[]
  }))
    .filter((p) => !used.has(p.arxivId))
    .slice(0, MAX_PAPERS)
  console.log(`[compose] ${papers.length} papers`)

  const numbers = await assembleEditionNumbers({ editionDate: args.date, stories, ieaStories, papers })
  const placeMap = new Map(places.map((p) => [p.slug, p]))
  const fallback = deterministicText({ stories, papers, places: placeMap })

  const modelInput = buildComposerInput({ editionDate: args.date, windowLabel, stories, ieaStories, papers, places: placeMap, numbers })
  const modelText = stories.length > 0 ? await generateText(modelInput, stories, fallback) : null
  const text = modelText?.text ?? fallback
  const model = modelText?.model ?? 'deterministic'
  // v3 rows carry per-figure status tags; v2 rows only the layer tags.
  const classifierVersion = stories.some((s) => s.facts?.figures.some((f) => f.status))
    ? 'v3-figures-2026-09'
    : stories.find((s) => s.layer)?.facts
      ? 'v2-snapshot-2026-09'
      : null

  const chartsRun = args.noCharts || stories.length === 0
    ? { charts: {} as EditionCharts, skips: EDITION_CHART_SECTIONS.map((section) => ({ section, reason: args.noCharts ? 'chart planner skipped (--no-charts)' : 'no stories' })), modelUsed: null }
    : await planEditionCharts({
        stories,
        ieaStories,
        papers,
        tape: numbers.tape,
        market: await marketForCharts(),
        perEdition: numbers.energy.perEdition,
        fieldBaseline: numbers.fieldBaseline,
        facilities: await facilitiesForCharts(),
        // Without the gateway rung 1 fails fast per section and rung 4 still draws.
        model: gatewayConfigured() ? chartPlannerModel() : 'text.opus',
        log: (l) => console.log(l),
      })

  const payload = {
    editionDate: args.date,
    text,
    numbers,
    storyIds: stories.map((s) => s.id),
    paperIds: papers.map((p) => p.arxivId),
    ieaIds: ieaStories.map((s) => s.id),
    model,
    classifierVersion,
    generatedAt: new Date().toISOString(),
    clearEdits: args.clearEdits,
    charts: chartsRun.charts,
    chartSkips: chartsRun.skips,
  }

  if (args.out) {
    writeFileSync(args.out, JSON.stringify(payload, null, 2), 'utf8')
    console.log(`[compose] wrote ${args.out}`)
  }
  if (args.dryRun) {
    console.log('\n----- edition (dry run, not written) -----')
    console.log(`headline: ${text.headline}\nsub: ${text.sub}\n`)
    text.notes.forEach((n, i) => console.log(`note ${i + 1}: [${n.metric ?? '—'}${n.unit ? ` ${n.unit}` : ''}] ${n.label} — ${n.text} (${n.sources.map((s) => s.name).join(', ')})`))
    for (const k of DC_LAYER_KEYS) console.log(`\n${DC_LAYERS[k].name}: ${text.layers[k].headline} — ${text.layers[k].sub} [${numbers.layerCounts[k]} stories, viz=${numbers.layerViz[k]?.kind ?? 'none'}]`)
    console.log(`\nresearch: ${text.research.headline} — ${text.research.sub}`)
    console.log(`\nmood ${numbers.moodScore} ${JSON.stringify(numbers.moodCounts)} · places ${numbers.geo.places.length} · power ${numbers.energy.hero?.value ?? 0} GW · tape ${numbers.tape.length}`)
    console.log(`\ncharts (${chartsRun.modelUsed ?? 'no model'}):\n  ${describeCharts(chartsRun.charts, chartsRun.skips)}`)
    return
  }

  const draft = await upsertDraftEdition(payload)
  const { layerCounts } = numbers
  console.log(
    `[compose] draft ${draft.date} written · model=${model} · ${draft.counts.stories} stories (dc ${layerCounts.dc} · hyper ${layerCounts.hyper} · semi ${layerCounts.semi} · equip ${layerCounts.equip}) · ${draft.counts.papers} papers · mood ${draft.moodScore ?? '—'} · charts ${Object.keys(chartsRun.charts).length}/${EDITION_CHART_SECTIONS.length} · auto-publish ${draft.autoPublishAt}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
