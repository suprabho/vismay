/**
 * AI Data Centers daily news recap — builds a markdown brief over a trailing
 * window (default 24h) of the dc_news feed and stores it as a snapshot row in
 * dc_news_recaps, where /api/ai-data-centers/recap serves it straight to the UI.
 *
 * Output is HYBRID, same recipe as the footshorts recap worker: Gemini writes
 * the editorial layer (headline, overview, 2–5 themed sections grouping the
 * day's stories), while the linked headlines and the tracked stocks' latest
 * daily moves (dc_stock_prices, migration 065) are assembled deterministically.
 * Without GEMINI_API_KEY — or when generation fails — the recap degrades to a
 * deterministic-only brief grouped by topic, so the cron never goes dark.
 *
 * Run locally:  pnpm ai-data-centers:news-recap
 *               pnpm ai-data-centers:news-recap -- --hours 48
 *               pnpm ai-data-centers:news-recap -- --dry-run
 *               pnpm ai-data-centers:news-recap -- --out recap.md
 * Run in CI:    .github/workflows/generate-dc-news-recap.yml (daily cron,
 *               scheduled after the dc_news scrape)
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — read dc_news /
 *     dc_stocks / dc_stock_prices, write dc_news_recaps
 *   GEMINI_API_KEY — optional; enables the narrative layer
 *   GEMINI_MODEL   — optional override (default gemini-2.5-flash — the recap
 *     needs real instruction-following, not the Gemma classifier tier)
 *
 * Idempotency: none by design — each run INSERTS a fresh snapshot (surrogate
 * id), so re-runs and manual dispatches append to a timeline rather than
 * overwrite the day. Readers take the newest row.
 */

import { writeFileSync } from 'node:fs'
import { GoogleGenAI } from '@google/genai'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'

const DEFAULT_HOURS = 24
// Ceiling on items handed to the LLM / listed in the brief. A busy news day
// lands well under this; it exists so a backfill window can't blow the prompt.
const MAX_ARTICLES = 150
// A mover's latest bar must be at most this stale (exchange holidays, retired
// tickers) to appear in the market section of a daily brief.
const MOVER_MAX_AGE_DAYS = 5
const MOVERS_PER_SIDE = 3

const TOPIC_LABELS: Record<string, string> = {
  ai: 'AI',
  'data-centers': 'Data centers',
  semiconductors: 'Semiconductors',
  microprocessors: 'Microprocessors',
}

interface Args {
  hours: number
  dryRun: boolean
  out: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { hours: DEFAULT_HOURS, dryRun: false, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    // pnpm forwards the `--` separator itself (npm strips it).
    if (a === '--') continue
    if (a === '--hours') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --hours value: ${argv[i]}`)
      args.hours = n
    } else if (a === '--dry-run') args.dryRun = true
    else if (a === '--out') args.out = argv[++i] ?? 'recap.md'
    else throw new Error(`Unknown flag: ${a}`)
  }
  return args
}

interface NewsRow {
  id: number
  source_url: string
  title: string
  summary: string | null
  source: string | null
  published_at: string
  topics: string[]
  tickers: string[]
}

interface Mover {
  ticker: string
  name: string
  currency: string
  close: number
  changePct: number
  tradeDate: string
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

type Sb = ReturnType<typeof createServiceClient>

async function loadWindowNews(sb: Sb, lo: string, hi: string): Promise<NewsRow[]> {
  const { data, error } = await sb
    .from('dc_news')
    .select('id, source_url, title, summary, source, published_at, topics, tickers')
    .eq('relevant', true)
    .gte('published_at', lo)
    .lt('published_at', hi)
    .order('published_at', { ascending: false })
    .limit(MAX_ARTICLES)
  if (error) throw new Error(`dc_news read failed: ${error.message}`)
  return (data ?? []) as NewsRow[]
}

/**
 * Latest day-over-day move per active ticker: the last two bars each ticker
 * has, provided the newest is recent enough for a daily brief. Empty result
 * (pre-backfill, or the prices table missing) just drops the market section.
 */
async function loadMarketMovers(sb: Sb, windowEnd: Date): Promise<Mover[]> {
  try {
    const cutoff = new Date(windowEnd.getTime() - 14 * 86_400_000).toISOString().slice(0, 10)
    const [stocksR, pricesR] = await Promise.all([
      sb.from('dc_stocks').select('ticker, name, currency').eq('is_active', true),
      sb
        .from('dc_stock_prices')
        .select('ticker, trade_date, close')
        .gte('trade_date', cutoff)
        .order('trade_date', { ascending: true })
        // ~30 tickers × ≤10 trading days — 1000 is PostgREST's default cap,
        // stated explicitly so a registry twice the size still fits.
        .limit(1000),
    ])
    if (stocksR.error) throw new Error(stocksR.error.message)
    if (pricesR.error) throw new Error(pricesR.error.message)

    const names = new Map<string, { name: string; currency: string }>()
    for (const s of (stocksR.data ?? []) as { ticker: string; name: string; currency: string }[]) {
      names.set(s.ticker, { name: s.name, currency: s.currency })
    }

    const barsByTicker = new Map<string, { trade_date: string; close: number }[]>()
    for (const r of (pricesR.data ?? []) as { ticker: string; trade_date: string; close: number }[]) {
      const arr = barsByTicker.get(r.ticker) ?? []
      arr.push(r)
      barsByTicker.set(r.ticker, arr)
    }

    const freshFloor = new Date(windowEnd.getTime() - MOVER_MAX_AGE_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const movers: Mover[] = []
    for (const [ticker, bars] of barsByTicker) {
      const meta = names.get(ticker)
      if (!meta || bars.length < 2) continue
      const last = bars[bars.length - 1]
      const prev = bars[bars.length - 2]
      if (last.trade_date < freshFloor || prev.close === 0) continue
      movers.push({
        ticker,
        name: meta.name,
        currency: meta.currency,
        close: last.close,
        changePct: ((last.close - prev.close) / prev.close) * 100,
        tradeDate: last.trade_date,
      })
    }
    return movers.sort((a, b) => b.changePct - a.changePct)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[news-recap] market movers unavailable (${msg}) — omitting section`)
    return []
  }
}

// ---------------------------------------------------------------------------
// Gemini narrative (hybrid layer)
// ---------------------------------------------------------------------------

interface Narrative {
  headline: string
  overview: string
  themes: { title: string; body: string; articleIdxs: number[] }[]
}

const NARRATIVE_SYSTEM = `You are the news editor for a dashboard tracking the AI infrastructure build-out: AI data centers, microprocessors, and the semiconductor industry.
You will receive the stories from a recent time window (headline, summary, outlet, topic tags, tracked stock tickers) plus the tracked stocks' latest daily price moves.
Write an internal daily brief. Be factual and concise — no hype, no opinion, and no facts that are not in the input. Never invent numbers, quotes, or events.

Respond ONLY with valid JSON in this exact shape, no markdown fences:
{
  "headline": "One sentence (max ~15 words) naming the day's single biggest development.",
  "overview": "3-5 sentence editorial overview of the window: the lead story, the secondary threads, and — when the price moves clearly echo the news — one sentence on the market. Plain text.",
  "themes": [
    {
      "title": "Short section title (3-6 words)",
      "body": "2-4 sentences synthesizing this theme's stories. Ground every claim in the provided headlines/summaries.",
      "articleIdxs": [0, 3]
    }
  ]
}

Rules:
- 2 to 5 themes, most important first. Every theme needs at least one articleIdx from the input.
- Each story belongs to at most one theme — pick its best fit. Leave minor stories out of themes entirely; they will be listed separately.
- articleIdxs must be idx values from the input, nothing else.`

function buildNarrativeInput(windowLabel: string, articles: NewsRow[], movers: Mover[]): unknown {
  return {
    window: windowLabel,
    stories: articles.map((a, idx) => ({
      idx,
      headline: a.title,
      summary: a.summary,
      outlet: a.source,
      topics: a.topics,
      tickers: a.tickers,
      publishedAt: a.published_at,
    })),
    stockMoves: movers.map((m) => ({
      ticker: m.ticker,
      company: m.name,
      dayChangePct: Number(m.changePct.toFixed(2)),
      asOf: m.tradeDate,
    })),
  }
}

async function generateNarrative(
  windowLabel: string,
  articles: NewsRow[],
  movers: Mover[]
): Promise<Narrative | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[news-recap] GEMINI_API_KEY not set — emitting deterministic-only recap')
    return null
  }
  const genai = new GoogleGenAI({ apiKey })
  const input = buildNarrativeInput(windowLabel, articles, movers)

  try {
    const res = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: `${NARRATIVE_SYSTEM}\n\nWrite the brief for this window:\n${JSON.stringify(input, null, 2)}` }],
        },
      ],
      config: { responseMimeType: 'application/json', temperature: 0.4 },
    })
    let text = (res.text ?? '').trim()
    // JSON mode usually returns clean JSON, but occasionally wraps it in
    // ```json fences (same tolerance as scripts/ingest/structure.ts).
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) text = fence[1].trim()
    const parsed = JSON.parse(text) as Partial<Narrative>
    if (
      typeof parsed.headline !== 'string' ||
      typeof parsed.overview !== 'string' ||
      !Array.isArray(parsed.themes)
    ) {
      console.warn('[news-recap] Gemini output missing expected shape — deterministic-only recap')
      return null
    }
    const themes = parsed.themes
      .filter(
        (t): t is Narrative['themes'][number] =>
          !!t && typeof t.title === 'string' && typeof t.body === 'string' && Array.isArray(t.articleIdxs)
      )
      .map((t) => ({
        ...t,
        articleIdxs: t.articleIdxs.filter(
          (i): i is number => Number.isInteger(i) && i >= 0 && i < articles.length
        ),
      }))
      .filter((t) => t.articleIdxs.length > 0)
      .slice(0, 5)
    return { headline: parsed.headline, overview: parsed.overview, themes }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[news-recap] narrative generation failed (${msg}) — deterministic-only recap`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Markdown assembly
// ---------------------------------------------------------------------------

function articleBullet(a: NewsRow): string {
  const outlet = a.source ? ` · _${a.source}_` : ''
  const tickers = a.tickers.length > 0 ? ` (${a.tickers.join(', ')})` : ''
  return `- [${a.title}](${a.source_url})${outlet}${tickers}`
}

function topicCounts(articles: NewsRow[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const a of articles) for (const t of a.topics) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function moversTable(movers: Mover[]): string[] {
  const gainers = movers.filter((m) => m.changePct > 0).slice(0, MOVERS_PER_SIDE)
  const losers = movers
    .filter((m) => m.changePct < 0)
    .slice(-MOVERS_PER_SIDE)
    .reverse()
  const rows = [...gainers, ...losers]
  if (rows.length === 0) return []
  const fmtClose = (m: Mover) =>
    `${m.close.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${m.currency}`
  const fmtPct = (p: number) => `${p > 0 ? '+' : ''}${p.toFixed(2)}%`
  return [
    '## Market movers',
    '',
    '_Largest daily moves among the tracked AI-infrastructure stocks, each on its home exchange._',
    '',
    '| Company | Ticker | Close | Day |',
    '| --- | --- | ---: | ---: |',
    ...rows.map((m) => `| ${m.name} | ${m.ticker} | ${fmtClose(m)} | ${fmtPct(m.changePct)} |`),
    '',
  ]
}

function assembleMarkdown(
  windowLabel: string,
  dateLabel: string,
  articles: NewsRow[],
  narrative: Narrative | null,
  movers: Mover[]
): string {
  const out: string[] = []

  out.push(`# AI infrastructure recap — ${dateLabel}`)
  out.push('')
  const topics = topicCounts(articles)
    .map(([t, n]) => `${TOPIC_LABELS[t] ?? t} (${n})`)
    .join(', ')
  out.push(
    `_${windowLabel} · ${articles.length} stor${articles.length === 1 ? 'y' : 'ies'}${topics ? ` · ${topics}` : ''}_`
  )
  out.push('')

  const cited = new Set<number>()

  if (narrative) {
    out.push('## Overview')
    out.push('')
    out.push(narrative.overview)
    out.push('')
    for (const theme of narrative.themes) {
      out.push(`## ${theme.title}`)
      out.push('')
      out.push(theme.body)
      out.push('')
      for (const idx of theme.articleIdxs) {
        cited.add(idx)
        out.push(articleBullet(articles[idx]))
      }
      out.push('')
    }
  } else {
    // Deterministic fallback: group by topic (an article files under its
    // first tag in vocabulary-count order so nothing repeats).
    for (const [topic] of topicCounts(articles)) {
      const rows = articles.filter((a, idx) => !cited.has(idx) && a.topics.includes(topic))
      if (rows.length === 0) continue
      out.push(`## ${TOPIC_LABELS[topic] ?? topic}`)
      out.push('')
      for (const a of rows) {
        cited.add(articles.indexOf(a))
        out.push(articleBullet(a))
      }
      out.push('')
    }
  }

  const rest = articles.filter((_, idx) => !cited.has(idx))
  if (rest.length > 0) {
    out.push('## More coverage')
    out.push('')
    for (const a of rest.slice(0, 30)) out.push(articleBullet(a))
    if (rest.length > 30) out.push(`- _…and ${rest.length - 30} more stories in the window._`)
    out.push('')
  }

  out.push(...moversTable(movers))

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sb = createServiceClient()

  const now = new Date()
  const lo = new Date(now.getTime() - args.hours * 60 * 60 * 1000)
  const windowLabel = `Last ${args.hours}h`
  const dateLabel = now.toISOString().slice(0, 10)

  console.log(`[news-recap] window=${lo.toISOString()} → ${now.toISOString()}${args.dryRun ? ' (dry)' : ''}`)

  const articles = await loadWindowNews(sb, lo.toISOString(), now.toISOString())
  if (articles.length === 0) {
    console.log('[news-recap] no relevant dc_news in the window — nothing to recap')
    return
  }
  console.log(`[news-recap] ${articles.length} relevant stories in the window`)

  const movers = await loadMarketMovers(sb, now)
  if (movers.length > 0) console.log(`[news-recap] ${movers.length} tickers with fresh daily moves`)

  const narrative = await generateNarrative(windowLabel, articles, movers)
  const markdown = assembleMarkdown(windowLabel, dateLabel, articles, narrative, movers)

  if (args.out) {
    writeFileSync(args.out, markdown, 'utf8')
    console.log(`[news-recap] wrote ${markdown.length} chars to ${args.out}`)
  }

  if (args.dryRun) {
    console.log('\n----- recap (dry run, not written to Supabase) -----\n')
    console.log(markdown)
    return
  }

  const topics = [...new Set(articles.flatMap((a) => a.topics))].sort()
  const tickers = [...new Set(articles.flatMap((a) => a.tickers))].sort()

  // Each run is a fresh snapshot in the timeline — insert, don't upsert.
  const { error } = await sb.from('dc_news_recaps').insert({
    window_hours: args.hours,
    window_start: lo.toISOString(),
    window_end: now.toISOString(),
    headline: narrative?.headline ?? null,
    markdown,
    model: narrative ? GEMINI_MODEL : null,
    article_count: articles.length,
    topics,
    tickers,
    generated_at: now.toISOString(),
  })
  if (error) throw new Error(`dc_news_recaps insert failed: ${error.message}`)

  console.log(
    `[news-recap] stored snapshot: ${articles.length} stories, ${narrative?.themes.length ?? 0} themes, ` +
      `narrative=${narrative ? 'yes' : 'no'}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
