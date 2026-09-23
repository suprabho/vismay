/**
 * AI Data Centers news scraper — consumes Google News' RSS search across four
 * queries (AI data centers, semiconductors, microprocessors, AI infra), has
 * Claude Haiku classify each new article, and upserts into dc_news.
 *
 * The classifier is one structured-output call per article that returns:
 *   * the relevance gate + topic tags + tracked tickers (migration 065), and
 *   * the daily-snapshot tags (migration 078): the AI layer, a place from the
 *     seeded dc_places list (+ its region), a theme, a mood (-1/0/1), an
 *     energy flag and `facts` — the action, the figures and the horizon the
 *     story states, which the edition's per-layer visualisations read.
 *   * (classifier v3) per figure: the canonical `subject`, a `scope` (site /
 *     company / market / policy), a `status` (committed / target / forecast /
 *     queued / stated) and the size in the dimension's base unit — the tags
 *     that decide which figures may share a scale on the edition's charts.
 *     Jev (typesafe-ai/jev via the AI gateway) then judges each figure as a
 *     typed yes/no and figures below the threshold are dropped
 *     (jevFigureGate.ts; fails open without AI_GATEWAY_API_KEY).
 *
 * Google News RSS for the same reason as scrape-energy-profile-news.ts:
 * a free, machine-friendly feed with broad outlet coverage (Reuters,
 * Bloomberg, trade press) that works from any IP — no per-publisher scraping.
 *
 * Run locally:  pnpm ai-data-centers:scrape-news
 *               pnpm ai-data-centers:scrape-news -- --backfill-days 30
 *                 (re-tags relevant rows that predate the snapshot tags, no
 *                  feed fetch — run once so the mood sparkline and field
 *                  baselines have history)
 *               pnpm ai-data-centers:scrape-news -- --retag-days 2
 *                 (re-tags relevant rows classified by an older classifier
 *                  version, no feed fetch — run once after a classifier
 *                  change so the current edition window carries the new
 *                  figure tags)
 * Run in CI:    .github/workflows/scrape-ai-data-centers-news.yml (daily cron)
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — read dc_stocks / dc_places, write dc_news
 *   ANTHROPIC_API_KEY                                    — classification
 *   AI_GATEWAY_API_KEY                                   — optional; enables the Jev figure gate
 *
 * Idempotency: source_url is the natural key (unique in migration 065).
 * Classifier rejects are stored with relevant=false — the queries here are
 * broader than the energy scraper's, so persisting rejects is what stops the
 * same off-topic article being re-sent to the LLM on every run while it sits
 * in the feed.
 *
 * Throughput: the four queries surface ~200-250 never-seen articles per day,
 * so classification runs through a bounded worker pool, and a soft deadline
 * stops the loop cleanly before the workflow's 30-minute kill — leftovers are
 * re-seen as new on the next run.
 */

import Anthropic from '@anthropic-ai/sdk'
import { JSDOM } from 'jsdom'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  DC_FIGURE_SCOPES,
  DC_FIGURE_STATUSES,
  DC_LAYER_KEYS,
  DC_REGION_KEYS,
  DC_STORY_ACTIONS,
  DC_THEME_KEYS,
  STOCK_CATEGORY_TO_LAYER,
  type DcFigureScope,
  type DcFigureStatus,
  type DcLayerKey,
  type DcMood,
  type DcRegionKey,
  type DcStoryAction,
  type DcStoryFacts,
  type DcStoryFigure,
  type DcThemeKey,
} from '@vismay/content-source/dcEditionTypes'
import { figureMagnitude } from '@vismay/content-source/dcEditionAssembly'
import { gateFigures } from './jevFigureGate'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

// Each query returns up to ~100 items; overlap between them is deduped by URL
// before the DB lookup. Kept deliberately broad — the LLM relevance gate is
// the precision filter, not the query.
const FEED_QUERIES = [
  '"AI data center" OR "AI data centre"',
  'semiconductor OR chipmaker',
  'microprocessor OR "chip manufacturing"',
  '"AI infrastructure" OR "AI chips" OR hyperscaler',
]

const TOPIC_VOCABULARY = ['ai', 'data-centers', 'semiconductors', 'microprocessors'] as const

// Haiku is the right tier for a yes/no + tags call: ~1-2s/item, and
// structured outputs make the JSON shape a guarantee rather than a regex
// scrape. Bump CLASSIFIER_VERSION whenever the prompt or schema changes — it
// is stored on every row so the mood series can be recomputed per version.
const CLASSIFIER_MODEL = 'claude-haiku-4-5'
const CLASSIFIER_VERSION = 'v3-figures-2026-09'
const CONCURRENCY = 4
// Stop pulling new items past this, well under the workflow's 30-minute
// timeout, so the job always exits green with a summary instead of being
// hard-killed mid-loop.
const DEADLINE_MS = 25 * 60_000
const MAX_FIGURES = 6

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })

const CLASSIFICATION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    relevant: { type: 'boolean' },
    topics: { type: 'array', items: { type: 'string' } },
    tickers: { type: 'array', items: { type: 'string' } },
    layer: nullable({ type: 'string', enum: DC_LAYER_KEYS }),
    place: nullable({ type: 'string' }),
    region: nullable({ type: 'string', enum: DC_REGION_KEYS }),
    theme: nullable({ type: 'string', enum: DC_THEME_KEYS }),
    mood: { type: 'integer', enum: [-1, 0, 1] },
    energy: { type: 'boolean' },
    facts: {
      type: 'object',
      properties: {
        action: nullable({ type: 'string', enum: DC_STORY_ACTIONS }),
        figures: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              value: { type: 'number' },
              unit: { type: 'string' },
              label: { type: 'string' },
              subject: nullable({ type: 'string' }),
              scope: nullable({ type: 'string', enum: DC_FIGURE_SCOPES }),
              status: nullable({ type: 'string', enum: DC_FIGURE_STATUSES }),
            },
            required: ['value', 'unit', 'label', 'subject', 'scope', 'status'],
            additionalProperties: false,
          },
        },
        horizon: nullable({
          type: 'object',
          properties: {
            from: nullable({ type: 'string' }),
            to: nullable({ type: 'string' }),
          },
          required: ['from', 'to'],
          additionalProperties: false,
        }),
      },
      required: ['action', 'figures', 'horizon'],
      additionalProperties: false,
    },
  },
  required: ['relevant', 'topics', 'tickers', 'layer', 'place', 'region', 'theme', 'mood', 'energy', 'facts'],
  additionalProperties: false,
}

function feedUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
}

interface NewsItem {
  url: string
  title: string
  summary: string | null
  publishedAt: string
  source: string | null
}

async function fetchFeed(query: string): Promise<NewsItem[]> {
  const res = await fetch(feedUrl(query), {
    headers: { 'user-agent': 'vizmaya-ai-data-centers-scraper/1.0 (+https://vizmaya.fyi)' },
  })
  if (!res.ok) {
    throw new Error(`RSS fetch failed for "${query}": ${res.status} ${res.statusText}`)
  }
  const xml = await res.text()
  const dom = new JSDOM(xml, { contentType: 'text/xml' })
  const items: NewsItem[] = []
  for (const item of dom.window.document.querySelectorAll('item')) {
    const url = item.querySelector('link')?.textContent?.trim()
    const rawTitle = item.querySelector('title')?.textContent?.trim()
    const pubDate = item.querySelector('pubDate')?.textContent?.trim()
    const description = item.querySelector('description')?.textContent?.trim() ?? null
    const source = item.querySelector('source')?.textContent?.trim() ?? null
    if (!url || !rawTitle || !pubDate) continue
    // Google News appends " - <Source>" to every title. Strip when the source
    // is known so headlines render cleanly.
    const title =
      source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(` - ${source}`.length))
        : rawTitle
    items.push({
      url,
      title,
      summary: description,
      publishedAt: new Date(pubDate).toISOString(),
      source,
    })
  }
  return items
}

interface TrackedStock {
  ticker: string
  name: string
  category: string
}

interface PlaceRow {
  slug: string
  name: string
  region: DcRegionKey
  aliases: string[]
}

/** Everything the classifier needs to validate the model's answer. */
interface ClassifierContext {
  validTickers: Set<string>
  stockCategory: Map<string, string>
  placeBySlug: Map<string, PlaceRow>
  /** lower-cased slug / name / alias → slug */
  placeLookup: Map<string, string>
}

function classifierSystem(stocks: TrackedStock[], places: PlaceRow[]): string {
  const tickerList = stocks.map((s) => `${s.ticker} — ${s.name} (${s.category})`).join('\n')
  const placeList = places
    .map((p) => `${p.slug} — ${p.name} [${p.region}]${p.aliases.length ? ` (${p.aliases.join(', ')})` : ''}`)
    .join('\n')
  return `You classify news headlines for a dashboard tracking the AI infrastructure build-out: AI data centers, microprocessors, and the semiconductor industry. Each story also feeds a frozen daily edition, so you extract a small set of tags and the facts the story states.

Topic vocabulary (use ONLY these tags):
- "ai"               — AI models, AI compute demand, AI industry moves
- "data-centers"     — data center construction, capacity, power, siting, operators
- "semiconductors"   — chip industry, foundries, memory, equipment, supply chain
- "microprocessors"  — CPUs/GPUs/accelerators as products or architectures

Tracked companies (ticker — name (category)):
${tickerList}

Layer (which part of the AI stack the story is mainly about):
- "dc"    — data-center sites, colocation, cooling, capacity leases, operators
- "hyper" — hyperscalers and AI labs: capex, power procurement, model-capacity deals
- "semi"  — accelerators, memory/HBM, foundry, packaging
- "equip" — lithography, deposition, etch, test tools, and chip export rules

Places (pick the slug the story is mainly about, or null when no listed place fits — never invent one):
${placeList}

Region (of the place, or of the story when no place fits): "na" North America · "ea" East Asia · "eu" Europe · "me" India & Middle East · "other" · null.

Theme (one): "power" (deals, grid queues, turbines, PPAs) · "permit" (freezes, rules, rezonings, policy) · "memory" (HBM/DRAM allocation) · "capacity" (MW added, leased, paused; new sites) · "equip" (tools, export rules) · "chips" (accelerators, foundry, packaging, nodes) · "sustain" (water, carbon, energy outlooks).

Mood — the day's Doom v Boom is scored story by story:
- 1  boom: expansion, demand, deals, capacity added, guidance raised, qualification won
- -1 doom: freezes, pauses, warnings, delays, grid strain, export-rule hits, lawsuits
- 0  neutral: analysis, explainers, mixed or purely descriptive news

Energy: true when the story carries a power, grid, water, carbon or electricity-demand claim.

Facts (only what the headline/summary literally state — never estimate):
- action: what happened — "add" (capacity/site added or broke ground) · "pause" · "freeze" · "power-deal" (PPA, generation, storage procurement) · "capacity" (leases, expansions without MW) · "permit" · "disclosure" (reports, water/carbon updates) · "pull-forward" (orders moved earlier) · "risk" (revenue/schedule warning) · "other" · null
- figures: every number the text states, each with:
  - value + unit: use "MW"/"GW" for power, "GWh" for storage, "%" for percentages, "tn USD"/"bn USD"/"mn USD" for money (convert other currencies' labels but keep the stated number and note the currency in the label), "year" for a year given as a figure, "years"/"months" for terms.
  - label: 2–6 words naming WHAT the number measures — "AI data center capacity", "cooling capacity", "investment 2026" — never a slogan or the story's angle.
  - subject: the canonical entity the figure belongs to, as the text names it — a company ("Amazon"), a site ("West Java campus"), a country ("South Korea"), a market ("global data center capacity"). null only when the text gives no owner.
  - scope: what the number describes — "site" (one facility or campus) · "company" (an operator or vendor as a whole) · "market" (an industry, country, region or global total) · "policy" (a rule, programme or public budget).
  - status: how firm it is — "committed" (signed, built, spent, let, contracted) · "target" (an announced goal) · "forecast" (a projection or analyst estimate) · "queued" (a pipeline, application or grid queue, not yet granted) · "stated" (none of these — a rate, a share, a date).
  e.g. {"value": 640, "unit": "MW", "label": "AI data center capacity", "subject": "BDx West Java campus", "scope": "site", "status": "committed"}, {"value": 20, "unit": "GW", "label": "data center capacity target", "subject": "global data center capacity", "scope": "market", "status": "target"}, {"value": 3, "unit": "bn USD", "label": "investment 2026", "subject": "KKR South Korea", "scope": "company", "status": "committed"}, {"value": 2029, "unit": "year", "label": "turbine delivery", "subject": "GE Vernova", "scope": "company", "status": "stated"}. Empty array when none.
- horizon: a stated time window as strings like "2027", "2027-Q1", "2027-06", "FY27" — {"from": null, "to": "2027"} for "booked through 2027", {"from": "2028", "to": "2027"} for orders pulled from 2028 into 2027. null when the story states no window.

Rules:
- relevant=false when the story is NOT materially about AI compute, data centers, chip making, chip markets, or a tracked company's AI/semiconductor/data-center business. Consumer gadget reviews, gaming deals, unrelated corporate or general-market news → relevant=false, empty arrays, layer/place/region/theme null, mood 0, energy false, facts {"action": null, "figures": [], "horizon": null}.
- topics: every vocabulary tag that clearly applies (usually 1–2).
- tickers: ONLY companies explicitly named in the headline or summary, or the unmistakable primary subject. Use the exact ticker strings from the list. Empty array if none.
- place: ONLY a slug from the list above.

Respond ONLY with valid JSON in this exact shape, no markdown fences:
{"relevant": true, "topics": ["semiconductors"], "tickers": ["NVDA"], "layer": "semi", "place": "hsinchu", "region": "ea", "theme": "chips", "mood": 1, "energy": false, "facts": {"action": "add", "figures": [{"value": 2, "unit": "×", "label": "CoWoS-L output", "subject": "TSMC", "scope": "company", "status": "target"}], "horizon": null}}`
}

interface Classification {
  relevant: boolean
  topics: string[]
  tickers: string[]
  layer: DcLayerKey | null
  place: string | null
  region: DcRegionKey | null
  theme: DcThemeKey | null
  mood: DcMood
  energy: boolean
  facts: DcStoryFacts
}

const REJECTED: Classification = {
  relevant: false,
  topics: [],
  tickers: [],
  layer: null,
  place: null,
  region: null,
  theme: null,
  mood: 0,
  energy: false,
  facts: { action: null, figures: [], horizon: null },
}

const clip = (s: unknown, max: number): string => (typeof s === 'string' ? s.trim().slice(0, max) : '')

function normaliseHorizonPart(v: unknown): string | null {
  const s = clip(v, 16)
  return s || null
}

/** Validate + normalise the model's JSON against the vocabularies and the seeded lists. */
function normalise(parsed: Record<string, unknown>, ctx: ClassifierContext): Classification {
  const topics = (Array.isArray(parsed.topics) ? parsed.topics : [])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.toLowerCase().trim())
    .filter((t) => (TOPIC_VOCABULARY as readonly string[]).includes(t))
  const tickers = (Array.isArray(parsed.tickers) ? parsed.tickers : [])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.toUpperCase().trim())
    .filter((t) => ctx.validTickers.has(t))
  // A "relevant" verdict with no recognised topic is noise — gate on both.
  const relevant = parsed.relevant === true && topics.length > 0
  if (!relevant) return REJECTED

  let layer = typeof parsed.layer === 'string' && (DC_LAYER_KEYS as string[]).includes(parsed.layer) ? (parsed.layer as DcLayerKey) : null
  if (!layer) {
    // Fall back to the first named company's registry category — the stock
    // categories are the layer taxonomy.
    for (const t of tickers) {
      const cat = ctx.stockCategory.get(t)
      if (cat && STOCK_CATEGORY_TO_LAYER[cat]) {
        layer = STOCK_CATEGORY_TO_LAYER[cat]
        break
      }
    }
  }
  if (!layer) {
    layer = topics.includes('data-centers') ? 'dc' : topics.includes('semiconductors') || topics.includes('microprocessors') ? 'semi' : 'hyper'
  }

  const placeRaw = typeof parsed.place === 'string' ? parsed.place.trim().toLowerCase() : ''
  const place = placeRaw ? (ctx.placeLookup.get(placeRaw) ?? null) : null
  const region: DcRegionKey | null = place
    ? ctx.placeBySlug.get(place)!.region
    : typeof parsed.region === 'string' && (DC_REGION_KEYS as string[]).includes(parsed.region)
      ? (parsed.region as DcRegionKey)
      : null
  const theme = typeof parsed.theme === 'string' && (DC_THEME_KEYS as string[]).includes(parsed.theme) ? (parsed.theme as DcThemeKey) : null
  const moodNum = Number(parsed.mood)
  const mood: DcMood = moodNum === 1 ? 1 : moodNum === -1 ? -1 : 0
  const energy = parsed.energy === true || theme === 'sustain'

  const f = parsed.facts && typeof parsed.facts === 'object' ? (parsed.facts as Record<string, unknown>) : {}
  const action =
    typeof f.action === 'string' && (DC_STORY_ACTIONS as string[]).includes(f.action) ? (f.action as DcStoryAction) : null
  const figures: DcStoryFigure[] = (Array.isArray(f.figures) ? f.figures : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => {
      const fig: DcStoryFigure = { value: Number(x.value), unit: clip(x.unit, 12), label: clip(x.label, 80) }
      fig.subject = clip(x.subject, 60) || null
      fig.scope = typeof x.scope === 'string' && (DC_FIGURE_SCOPES as string[]).includes(x.scope) ? (x.scope as DcFigureScope) : null
      fig.status = typeof x.status === 'string' && (DC_FIGURE_STATUSES as string[]).includes(x.status) ? (x.status as DcFigureStatus) : null
      fig.base = Number.isFinite(fig.value) ? figureMagnitude(fig) : null
      return fig
    })
    .filter((x) => Number.isFinite(x.value))
    .slice(0, MAX_FIGURES)
  const h = f.horizon && typeof f.horizon === 'object' ? (f.horizon as Record<string, unknown>) : null
  const horizon = h ? { from: normaliseHorizonPart(h.from), to: normaliseHorizonPart(h.to) } : null

  return {
    relevant,
    topics,
    tickers,
    layer,
    place,
    region,
    theme,
    mood,
    energy,
    facts: { action, figures, horizon: horizon && (horizon.from || horizon.to) ? horizon : null },
  }
}

function parseJsonText(text: string): Record<string, unknown> | null {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  try {
    const parsed = JSON.parse(t)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// Structured outputs guarantee the shape on a normal finish. Should the API
// ever reject the schema itself (a 400 naming the schema / output_config),
// the run drops to plain JSON mode for the rest of the process — the prompt
// already spells the shape out, and normalise() re-validates everything.
let useSchema = true

function isSchemaRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /schema|output_config|output_format/i.test(msg) && /400|invalid/i.test(msg)
}

async function classify(
  anthropic: Anthropic,
  system: string,
  item: NewsItem,
  ctx: ClassifierContext
): Promise<Classification> {
  const userText = `Headline: ${item.title}\n\n${
    item.summary ? `Summary: ${item.summary}` : '(no summary available)'
  }\n\nOutlet: ${item.source ?? 'unknown'} · Published: ${item.publishedAt}`

  let text = ''
  try {
    const response = await anthropic.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: userText }],
      ...(useSchema ? { output_config: { format: { type: 'json_schema', schema: CLASSIFICATION_SCHEMA } } } : {}),
    })
    for (const block of response.content) {
      if (block.type === 'text') {
        text = block.text
        break
      }
    }
  } catch (err) {
    if (useSchema && isSchemaRejection(err)) {
      console.warn(`  ! structured output schema rejected — falling back to plain JSON for this run`)
      useSchema = false
      return classify(anthropic, system, item, ctx)
    }
    throw err
  }
  // A refusal or max_tokens cut can still yield unparseable text — treat as off-topic.
  const parsed = parseJsonText(text)
  const cls = parsed ? normalise(parsed, ctx) : REJECTED
  if (!cls.relevant || cls.facts.figures.length === 0) return cls
  // Jev judges each extracted figure as a typed yes/no: literally stated, and
  // tagged right. Drops below the threshold; keeps the score on the rest.
  const gated = await gateFigures({ headline: item.title, summary: item.summary, outlet: item.source }, cls.facts.figures)
  const dropped = gated.filter((g) => !g.kept)
  if (dropped.length) console.log(`    jev dropped ${dropped.length}/${gated.length}: ${dropped.map((g) => `${g.value} ${g.unit} ${g.label} (${g.confidence})`).join(' · ')}`)
  return { ...cls, facts: { ...cls.facts, figures: gated.filter((g) => g.kept).map(({ kept: _kept, ...f }) => f) } }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Run `worker` over `items` with a bounded number of concurrent tasks. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

function tagColumns(cls: Classification) {
  return {
    layer: cls.layer,
    place: cls.place,
    region: cls.region,
    theme: cls.theme,
    mood: cls.mood,
    energy: cls.energy,
    facts: cls.facts,
    classifier_version: CLASSIFIER_VERSION,
  }
}

function describe(cls: Classification): string {
  const bits = [cls.layer, cls.place, cls.theme, cls.mood === 1 ? 'boom' : cls.mood === -1 ? 'doom' : 'neutral']
  if (cls.energy) bits.push('energy')
  if (cls.facts.figures.length) {
    const tagged = cls.facts.figures.filter((f) => f.status).length
    bits.push(`${cls.facts.figures.length} fig${tagged ? ` (${tagged} tagged)` : ''}`)
  }
  return bits.filter(Boolean).join(' · ')
}

interface Args {
  /** Re-tag relevant rows with no snapshot tags (layer null) in the last N days. */
  backfillDays: number | null
  /** Re-tag relevant rows classified by an older classifier version in the last N days. */
  retagDays: number | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { backfillDays: null, retagDays: null }
  const days = (flag: string, raw: string | undefined): number => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${flag} value: ${raw}`)
    return n
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') continue
    if (a === '--backfill-days') args.backfillDays = days(a, argv[++i])
    else if (a === '--retag-days') args.retagDays = days(a, argv[++i])
    else throw new Error(`Unknown flag: ${a}`)
  }
  return args
}

type Sb = ReturnType<typeof createServiceClient>

async function loadContext(sb: Sb): Promise<{ system: string; ctx: ClassifierContext }> {
  // The classifier's ticker list comes from dc_stocks so the migration seed
  // stays the single source of truth — adding a company needs no code change.
  const { data: stockRows, error: stocksErr } = await sb
    .from('dc_stocks')
    .select('ticker, name, category')
    .eq('is_active', true)
    .order('ticker')
  if (stocksErr) throw new Error(`dc_stocks read failed: ${stocksErr.message}`)
  const stocks = (stockRows ?? []) as TrackedStock[]
  if (stocks.length === 0) {
    throw new Error('dc_stocks is empty — apply migration 065 before scraping')
  }
  // Same for places (migration 078): the model picks from this list or null.
  const { data: placeRows, error: placesErr } = await sb
    .from('dc_places')
    .select('slug, name, region, aliases')
    .eq('is_active', true)
    .order('slug')
  if (placesErr) throw new Error(`dc_places read failed: ${placesErr.message} — apply migration 078`)
  const places = (placeRows ?? []) as PlaceRow[]

  const placeLookup = new Map<string, string>()
  for (const p of places) {
    placeLookup.set(p.slug.toLowerCase(), p.slug)
    placeLookup.set(p.name.toLowerCase(), p.slug)
    for (const a of p.aliases ?? []) placeLookup.set(a.toLowerCase(), p.slug)
  }
  return {
    system: classifierSystem(stocks, places),
    ctx: {
      validTickers: new Set(stocks.map((s) => s.ticker)),
      stockCategory: new Map(stocks.map((s) => [s.ticker, s.category])),
      placeBySlug: new Map(places.map((p) => [p.slug, p])),
      placeLookup,
    },
  }
}

/**
 * One-off re-tagging, no feed fetch. `untagged`: relevant rows written before
 * the snapshot tags existed (layer is null). `stale`: relevant rows tagged by
 * an older classifier version — run after a prompt/schema change so the
 * current window carries the new fields. Relevance, topics and tickers are
 * left as they are — this only rewrites the tag columns.
 */
async function backfill(
  sb: Sb,
  anthropic: Anthropic,
  system: string,
  ctx: ClassifierContext,
  opts: { days: number; mode: 'untagged' | 'stale' },
  startedAt: number,
) {
  const { days, mode } = opts
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  let q = sb
    .from('dc_news')
    .select('id, source_url, title, summary, source, published_at')
    .eq('relevant', true)
    .gte('published_at', since)
  q = mode === 'untagged' ? q.is('layer', null) : q.or(`classifier_version.is.null,classifier_version.neq.${CLASSIFIER_VERSION}`)
  const { data, error } = await q.order('published_at', { ascending: false }).limit(3000)
  if (error) throw new Error(`backfill read failed: ${error.message}`)
  const rows = (data ?? []) as { id: number; source_url: string; title: string; summary: string | null; source: string | null; published_at: string }[]
  console.log(`[backfill] ${rows.length} ${mode === 'untagged' ? 'untagged' : `pre-${CLASSIFIER_VERSION}`} relevant rows in the last ${days} days`)

  let tagged = 0
  let skipped = 0
  let failed = 0
  await pool(rows, CONCURRENCY, async (row) => {
    if (Date.now() - startedAt > DEADLINE_MS) {
      skipped++
      return
    }
    const item: NewsItem = { url: row.source_url, title: row.title, summary: row.summary, publishedAt: row.published_at, source: row.source }
    try {
      let cls: Classification
      try {
        cls = await classify(anthropic, system, item, ctx)
      } catch {
        await sleep(5000)
        cls = await classify(anthropic, system, item, ctx)
      }
      // A row the v2 gate would now reject keeps relevant=true (it's already
      // in the feed) but is tagged neutral with no layer facts.
      const cols = cls.relevant ? tagColumns(cls) : { ...tagColumns(REJECTED), layer: 'dc', classifier_version: CLASSIFIER_VERSION }
      const { error: updErr } = await sb.from('dc_news').update(cols).eq('id', row.id)
      if (updErr) {
        failed++
        console.error(`  ✗ #${row.id}: ${updErr.message}`)
        return
      }
      tagged++
      console.log(`  ✓ #${row.id} ${row.title}  →  ${describe(cls)}`)
      await sleep(300)
    } catch (err) {
      failed++
      console.error(`  ✗ #${row.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  })
  if (skipped > 0) console.log(`\n[backfill] deadline reached — ${skipped} rows left for the next run`)
  console.log(`\n[backfill] done: ${tagged} tagged, ${failed} failed`)
  if (failed > 0 && tagged === 0) throw new Error('every backfill classification failed — check ANTHROPIC_API_KEY')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sb = createServiceClient()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
  // 60s per-request cap + the SDK's built-in 429/5xx retries: a hung or
  // throttled call surfaces as a throw the per-item retry below can handle,
  // instead of stalling a pool worker for minutes.
  const anthropic = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 })
  const startedAt = Date.now()

  const { system, ctx } = await loadContext(sb)

  if (args.backfillDays != null) {
    await backfill(sb, anthropic, system, ctx, { days: args.backfillDays, mode: 'untagged' }, startedAt)
    return
  }
  if (args.retagDays != null) {
    await backfill(sb, anthropic, system, ctx, { days: args.retagDays, mode: 'stale' }, startedAt)
    return
  }

  const byUrl = new Map<string, NewsItem>()
  let feedFailures = 0
  for (const query of FEED_QUERIES) {
    console.log(`Fetching Google News RSS for ${query} ...`)
    let feedItems: NewsItem[]
    try {
      feedItems = await fetchFeed(query)
    } catch {
      // Google News occasionally 503s a single query; one retry, then keep
      // going with the other feeds instead of failing the whole run.
      await sleep(10_000)
      try {
        feedItems = await fetchFeed(query)
      } catch (retryErr) {
        const msg = retryErr instanceof Error ? retryErr.message : String(retryErr)
        console.warn(`  skipping feed: ${msg}`)
        feedFailures++
        continue
      }
    }
    console.log(`  ${feedItems.length} items`)
    for (const item of feedItems) {
      if (!byUrl.has(item.url)) byUrl.set(item.url, item)
    }
  }
  if (feedFailures === FEED_QUERIES.length) {
    throw new Error('All feeds failed — Google News RSS outage?')
  }
  const items = [...byUrl.values()]
  console.log(
    `${items.length} unique items across ${FEED_QUERIES.length - feedFailures} feeds`
  )

  if (items.length === 0) {
    console.log('Empty feeds — nothing to do')
    return
  }

  const urls = items.map((i) => i.url)
  // Google News redirect URLs run ~500 chars each. Stuffing them all into a
  // single `.in()` blows past PostgREST's URL length limit (8KB), which
  // surfaces as a 400 Bad Request. Batch the lookup at ~15/page (~7.5KB).
  const existingUrls = new Set<string>()
  const LOOKUP_BATCH = 15
  for (let i = 0; i < urls.length; i += LOOKUP_BATCH) {
    const batch = urls.slice(i, i + LOOKUP_BATCH)
    const { data, error: lookupErr } = await sb
      .from('dc_news')
      .select('source_url')
      .in('source_url', batch)
    if (lookupErr) throw new Error(`Lookup failed: ${lookupErr.message}`)
    for (const row of (data ?? []) as { source_url: string }[]) {
      existingUrls.add(row.source_url)
    }
  }

  const newItems = items.filter((i) => !existingUrls.has(i.url))
  console.log(
    `${newItems.length} new (${items.length - newItems.length} already in DB)`
  )

  let inserted = 0
  let rejected = 0
  let skipped = 0
  let failed = 0
  await pool(newItems, CONCURRENCY, async (item) => {
    if (Date.now() - startedAt > DEADLINE_MS) {
      skipped++
      return
    }
    try {
      let cls: Classification
      try {
        cls = await classify(anthropic, system, item, ctx)
      } catch {
        // One retry after a pause, on top of the SDK's own backoff — the
        // first run can push a few hundred items through in one go.
        await sleep(5000)
        cls = await classify(anthropic, system, item, ctx)
      }
      const { error: insertErr } = await sb.from('dc_news').upsert(
        {
          source_url: item.url,
          title: item.title,
          summary: item.summary,
          source: item.source,
          published_at: item.publishedAt,
          relevant: cls.relevant,
          topics: cls.topics,
          tickers: cls.tickers,
          ...tagColumns(cls),
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'source_url' }
      )
      if (insertErr) {
        console.error(`  ✗ ${item.url}: ${insertErr.message}`)
        return
      }
      if (cls.relevant) {
        inserted++
        console.log(
          `  ✓ [${item.source ?? '?'}] ${item.title}  →  [${cls.topics.join(', ')}]${
            cls.tickers.length > 0 ? ` (${cls.tickers.join(', ')})` : ''
          } · ${describe(cls)}`
        )
      } else {
        rejected++
        console.log(`  · [${item.source ?? '?'}] ${item.title}  →  off-topic`)
      }
      await sleep(300) // spaces each worker's requests under the RPM ceiling
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ ${item.url}: ${msg}`)
    }
  })

  // Every attempt failing means a systemic problem (bad key, no credits, API
  // outage) — fail the run so the cron goes red instead of green-but-empty.
  if (failed > 0 && inserted + rejected === 0) {
    throw new Error(
      `All ${failed} classification attempts failed — check ANTHROPIC_API_KEY / account credits`
    )
  }

  if (skipped > 0) {
    console.log(
      `\nDeadline reached — processed ${newItems.length - skipped} of ${newItems.length} new items; the rest will be picked up next run.`
    )
  }
  console.log(
    `\nDone. ${inserted} relevant + ${rejected} off-topic stored, of ${newItems.length} new items.`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
