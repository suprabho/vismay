/**
 * Doom v Boom archive re-score — applies the market tilt (news+market-v2) to
 * editions composed before it existed.
 *
 * Those editions froze the news reading alone (`mood_counts.method` =
 * events-v1, no `mood_counts.score`). For each one this computes the session
 * it would have read (the calendar day before, `marketSession`), tilts the
 * frozen news reading by it with the current calibration, and rewrites
 *   mood_score          the tilted score
 *   mood_counts.score   { method, news, market, marketWeight } — the split the meter prints
 *   mood_series         the edition's 30-day history, each point tilted by its own session
 * Nothing else on the row changes; the prose never quotes the score. An
 * edition that already carries `mood_counts.score` is left alone, so a rerun
 * is a no-op. The news reading stays in `mood_counts.score.news`, and
 * `--backup` writes the rows as they were, so the rewrite can be undone.
 *
 * Run locally:  pnpm ai-data-centers:retilt-editions                       # dry run, prints the table
 *               pnpm ai-data-centers:retilt-editions -- --write --backup editions-before.json
 *               pnpm ai-data-centers:retilt-editions -- --from 2026-09-23 --to 2026-09-30
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { writeFileSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'
import { getDcCloseSeries, getDcMarketStocks, getMoodCalibration } from '@vismay/dc-editions/dcEditions'
import { blendMoodScore, marketSession, scoreMarket, sessionMoves } from '@vismay/dc-editions/dcEditionAssembly'
import { MOOD_METHOD, SCORE_METHOD, formatSigned, moodWord, type EditionMoodScore } from '@vismay/dc-editions/dcEditionTypes'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

interface Args {
  from: string | null
  to: string | null
  write: boolean
  backup: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { from: null, to: null, write: false, backup: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') continue
    else if (a === '--from') args.from = argv[++i] ?? null
    else if (a === '--to') args.to = argv[++i] ?? null
    else if (a === '--write') args.write = true
    else if (a === '--backup') args.backup = argv[++i] ?? 'editions-before.json'
    else throw new Error(`Unknown flag: ${a}`)
  }
  return args
}

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface Row {
  id: number
  edition_date: string
  status: string
  mood_score: number | string | null
  mood_counts: ({ method?: string; score?: EditionMoodScore } & Record<string, unknown>) | null
  mood_series: { date: string; score: number | null }[] | null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sb = createServiceClient()

  let q = sb.from('dc_editions').select('id, edition_date, status, mood_score, mood_counts, mood_series').order('edition_date')
  if (args.from) q = q.gte('edition_date', args.from)
  if (args.to) q = q.lte('edition_date', args.to)
  const { data, error } = await q
  if (error) throw new Error(`dc_editions read failed: ${error.message}`)
  const rows = (data ?? []) as Row[]

  // Only editions that froze an events-weighted news reading and no split yet.
  const todo = rows.filter((r) => r.mood_score != null && r.mood_counts?.method === MOOD_METHOD && !r.mood_counts.score)
  console.log(`${rows.length} edition(s) read, ${todo.length} to tilt (the rest already carry a split, or predate the events reading)`)
  if (todo.length === 0) return

  const dates = todo.flatMap((r) => [r.edition_date, ...(r.mood_series ?? []).map((p) => p.date)]).sort()
  const [closes, stocks, calibration] = await Promise.all([
    getDcCloseSeries(shift(dates[0], -10), dates[dates.length - 1]),
    getDcMarketStocks(),
    getMoodCalibration(),
  ])
  console.log(`Calibration: scale ${calibration.scalePct}% · weight ${calibration.marketWeight}${calibration.calibratedAt ? '' : ' (code defaults — never calibrated)'}\n`)
  const marketFor = (d: string) => {
    const session = marketSession(d)
    return scoreMarket(sessionMoves(closes, stocks, session), session, calibration.scalePct)
  }

  if (args.write && args.backup) {
    writeFileSync(args.backup, `${JSON.stringify(todo, null, 2)}\n`)
    console.log(`Backup of ${todo.length} row(s) → ${args.backup}\n`)
  }

  console.log('| edition | status | news | session | move % | market | score | word | history points tilted |')
  console.log('|---|---|---:|---|---:|---:|---:|---|---:|')
  for (const r of todo) {
    const news = Number(r.mood_score)
    const market = marketFor(r.edition_date)
    const score = blendMoodScore(news, market, calibration.marketWeight)
    let tilted = 0
    const series = (r.mood_series ?? []).map((p) => {
      // The edition's own point is its stored score; every other day was a news reading too.
      const next = p.date === r.edition_date ? score : blendMoodScore(p.score, marketFor(p.date), calibration.marketWeight)
      if (next !== p.score) tilted++
      return { ...p, score: next }
    })
    const word = moodWord(news) === moodWord(score) ? moodWord(score) : `${moodWord(news)} → ${moodWord(score)}`
    console.log(
      `| ${r.edition_date} | ${r.status} | ${formatSigned(news)} | ${market ? market.session : '—'} | ${market ? formatSigned(market.avgPct) : '—'} | ${formatSigned(market?.score ?? null)} | ${formatSigned(score)} | ${word} | ${tilted} of ${series.length} |`
    )
    if (!args.write) continue
    const split: EditionMoodScore = { method: SCORE_METHOD, news, market, marketWeight: calibration.marketWeight }
    const { error: upErr } = await sb
      .from('dc_editions')
      .update({ mood_score: score, mood_counts: { ...r.mood_counts, score: split }, mood_series: series })
      .eq('id', r.id)
    if (upErr) throw new Error(`update ${r.edition_date}: ${upErr.message}`)
  }
  console.log(args.write ? `\nWrote ${todo.length} edition(s).` : '\nDry run — rerun with --write (and --backup FILE) to rewrite these editions.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
