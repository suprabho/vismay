/**
 * Doom v Boom — backfill the daily readings and recalibrate the market term.
 *
 * The edition score is (1 − w) × news + w × market, where market =
 * tanh(layer-balanced session move / scale) (dcEditionAssembly.ts). The
 * weight is an editorial choice; the scale is not: it decides how far a given
 * move swings the reading. This script replays history and fits the scale so
 * the market reading swings as much (standard deviation) as the news reading,
 * which makes w the market's actual share of the score's movement.
 *
 *   1. News: re-reads every edition day of the last --news-days from the
 *      tagged feed, the same way the composer's history loop does (events,
 *      weighted), ignoring published scores so every day is measured alike.
 *   2. Market: the layer-balanced, cap-weighted session move for every
 *      session of the last --market-days (current caps as the weights).
 *   3. Fits the scale, then prints — for the days that have both — news,
 *      market and blended readings, how often the blend changes the day's
 *      word, and how the two sides correlate (same session, and the news
 *      against the NEXT session: does the market follow the news?).
 *   4. --write appends the result to dc_mood_calibrations (migration 082);
 *      the next compose reads the newest row. Without it, nothing is written.
 *
 * Published editions are frozen (a DB trigger rejects updates), so nothing
 * here rewrites the archive. What "backfill" means: the readings are
 * recomputed for every past day, and each compose's 7- and 30-day marks use
 * the calibrated market term too.
 *
 * Coverage it needs: prices (dispatch import-dc-stock-prices with
 * full_backfill=true once) and tagged news (the scrape's backfill_days /
 * retag_days). Too little of either and it reports what's missing instead
 * of fitting.
 *
 * Run locally:  pnpm ai-data-centers:calibrate-mood
 *               pnpm ai-data-centers:calibrate-mood -- --news-days 90 --market-days 730 --write
 *               pnpm ai-data-centers:calibrate-mood -- --weight 0.3 --write --note "more market"
 * Run in CI:    .github/workflows/calibrate-dc-mood.yml (manual dispatch)
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { appendFileSync, writeFileSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import {
  getDcCloseSeries,
  getDcMarketStocks,
  getMoodCalibration,
  readDailyNewsReadings,
  saveMoodCalibration,
} from '@vismay/content-source/dcEditions'
import {
  blendMoodScore,
  correlation,
  fitMarketScale,
  layerBalancedMove,
  marketSession,
  scoreMarket,
  sessionMoves,
} from '@vismay/content-source/dcEditionAssembly'
import { editionDateFor, formatSigned, moodWord } from '@vismay/content-source/dcEditionTypes'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

interface Args {
  newsDays: number
  marketDays: number
  weight: number | null
  write: boolean
  note: string | null
  csv: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { newsDays: 60, marketDays: 365, weight: null, write: false, note: null, csv: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') continue
    else if (a === '--news-days') args.newsDays = Math.max(7, Number(argv[++i]) || args.newsDays)
    else if (a === '--market-days') args.marketDays = Math.max(30, Number(argv[++i]) || args.marketDays)
    else if (a === '--weight') {
      const w = Number(argv[++i])
      if (!(w >= 0 && w <= 1)) throw new Error('--weight must be between 0 and 1')
      args.weight = w
    } else if (a === '--write') args.write = true
    else if (a === '--note') args.note = argv[++i] ?? null
    else if (a === '--csv') args.csv = argv[++i] ?? 'mood-calibration.csv'
    else throw new Error(`Unknown flag: ${a}`)
  }
  return args
}

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const stdev = (v: number[]) => {
  if (v.length < 2) return 0
  const m = v.reduce((a, b) => a + b, 0) / v.length
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1))
}

const pct = (v: number[], p: number) => {
  const s = [...v].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN
}

const r3 = (v: number) => Math.round(v * 1000) / 1000

/** Markdown for the Actions step summary, plain text otherwise. */
const out: string[] = []
const say = (line = '') => {
  console.log(line)
  out.push(line)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const to = editionDateFor(new Date())
  const current = await getMoodCalibration()
  const weight = args.weight ?? current.marketWeight

  // 1. Market: every session of the window, layer-balanced and cap-weighted.
  const marketFrom = shift(to, -args.marketDays)
  const [closes, stocks] = await Promise.all([getDcCloseSeries(shift(marketFrom, -8), to), getDcMarketStocks()])
  const moveBySession = new Map<string, number>()
  for (let d = marketFrom; d <= to; d = shift(d, 1)) {
    const b = layerBalancedMove(sessionMoves(closes, stocks, d))
    if (b) moveBySession.set(d, b.avgPct)
  }
  const capped = [...stocks.values()].filter((s) => s.capUsdBn != null)
  const uncapped = [...stocks.values()].filter((s) => s.capUsdBn == null).map((s) => s.ticker)

  // 2. News: every edition day of the window, re-read from the feed.
  const newsFrom = shift(to, -(args.newsDays - 1))
  const news = await readDailyNewsReadings(newsFrom, to)
  const newsScored = news.filter((d): d is { date: string; news: number; stories: number } => d.news != null)

  say(`## Doom v Boom calibration · ${to}`)
  say()
  say(`- Current: scale ${current.scalePct}% · market weight ${current.marketWeight} · ${current.calibratedAt ? `calibrated ${current.calibratedAt.slice(0, 10)}` : 'code defaults (never calibrated)'}`)
  say(`- Market: ${moveBySession.size} sessions ${marketFrom} → ${to} · ${stocks.size} tickers, ${capped.length} with a market cap${uncapped.length ? ` (layer median for ${uncapped.join(', ')})` : ''}`)
  say(`- News: ${newsScored.length} of ${news.length} edition days scored ${newsFrom} → ${to}`)

  const missing: string[] = []
  if (moveBySession.size < 20) missing.push('prices — dispatch import-dc-stock-prices with full_backfill=true')
  if (newsScored.length < 10) missing.push('tagged news — dispatch the scrape with backfill_days / retag_days')
  const moves = [...moveBySession.values()]
  const scale = missing.length ? null : fitMarketScale(moves, newsScored.map((d) => d.news))
  if (scale == null) {
    say()
    say(`**No fit.** ${missing.length ? `Not enough history: ${missing.join('; ')}.` : 'One side is flat.'}`)
    finish()
    if (args.write) process.exit(1)
    return
  }

  // 3. Paired days: the edition's news against the session it reads (the day before) and the next one.
  const rows = newsScored.map((d) => {
    const session = marketSession(d.date)
    const m = scoreMarket(sessionMoves(closes, stocks, session), session, scale)
    const next = moveBySession.get(d.date) ?? null
    return { ...d, session, move: m?.avgPct ?? null, market: m?.score ?? null, blended: blendMoodScore(d.news, m, weight), next }
  })
  const paired = rows.filter((r) => r.market != null)
  const lead = rows.filter((r) => r.next != null)
  const bandChanges = paired.filter((r) => moodWord(r.news) !== moodWord(r.blended)).length
  const marketStd = stdev(paired.map((r) => r.market!))
  const newsStd = stdev(newsScored.map((d) => d.news))
  // Share of the score's variance from each side (score = news + w × market), covariance split evenly.
  const cov = (correlation(paired.map((r) => r.news), paired.map((r) => r.market!)) ?? 0) * newsStd * marketStd
  const vn = newsStd ** 2
  const vm = (weight * marketStd) ** 2
  const vc = 2 * weight * cov
  const tilts = paired.map((r) => Math.abs(r.blended! - r.news))
  const loweredOnUp = paired.filter((r) => r.market! > 0 && r.blended! < r.news).length
  const marketShare = vn + vm + vc > 0 ? (vm + vc / 2) / (vn + vm + vc) : 0

  say()
  say(`### Fit`)
  say()
  say(`- **Scale ${scale}%** (was ${current.scalePct}%): an average layer move of ±${scale}% reads as ±0.76`)
  say(`- Session moves: sd ${r3(stdev(moves))}% · p5 ${r3(pct(moves, 0.05))}% · p50 ${r3(pct(moves, 0.5))}% · p95 ${r3(pct(moves, 0.95))}%`)
  say(`- News reading: sd ${r3(newsStd)} · mean ${formatSigned(newsScored.reduce((a, d) => a + d.news, 0) / newsScored.length)}`)
  say(`- Weight ${weight} (a tilt: score = news + ${weight} × market): over ${paired.length} paired days the market moves the score by ${r3(tilts.reduce((a, b) => a + b, 0) / (tilts.length || 1))} on average, ${r3(Math.max(0, ...tilts))} at most — ~${Math.round(marketShare * 100)}% of the score's movement; it changes the day's word on ${bandChanges} of them, and lowers the score on ${loweredOnUp} up sessions`)
  say(`- Correlation, news vs the session it reads: ${correlation(paired.map((r) => r.news), paired.map((r) => r.market!)) ?? '—'} · news vs the next session: ${correlation(lead.map((r) => r.news), lead.map((r) => r.next!)) ?? '—'} (${lead.length} days)`)
  say()
  say(`### Daily readings (backfilled)`)
  say()
  say('| edition | stories | news | session | move % | market | score | word |')
  say('|---|---:|---:|---|---:|---:|---:|---|')
  for (const r of [...rows].reverse()) {
    const word = moodWord(r.news) === moodWord(r.blended) ? moodWord(r.blended) : `${moodWord(r.news)} → ${moodWord(r.blended)}`
    say(`| ${r.date} | ${r.stories} | ${formatSigned(r.news)} | ${r.move == null ? '—' : r.session} | ${r.move == null ? '—' : formatSigned(r.move)} | ${formatSigned(r.market)} | ${formatSigned(r.blended)} | ${word} |`)
  }

  if (args.csv) {
    const csv = ['date,stories,news,session,move_pct,market,score']
      .concat(rows.map((r) => [r.date, r.stories, r.news, r.move == null ? '' : r.session, r.move ?? '', r.market ?? '', r.blended ?? ''].join(',')))
      .join('\n')
    writeFileSync(args.csv, `${csv}\n`)
    console.log(`\nwrote ${args.csv}`)
  }

  if (args.write) {
    await saveMoodCalibration({
      scalePct: scale,
      marketWeight: weight,
      note: args.note,
      basis: {
        to,
        newsDays: newsScored.length,
        sessions: moveBySession.size,
        paired: paired.length,
        newsStd: r3(newsStd),
        moveStd: r3(stdev(moves)),
        marketStd: r3(marketStd),
        marketShare: r3(marketShare),
        corrSameSession: correlation(paired.map((r) => r.news), paired.map((r) => r.market!)),
        corrNextSession: correlation(lead.map((r) => r.news), lead.map((r) => r.next!)),
        bandChanges,
        cappedTickers: capped.length,
        uncappedTickers: uncapped,
        previous: { scalePct: current.scalePct, marketWeight: current.marketWeight, calibratedAt: current.calibratedAt },
      },
    })
    say()
    say(`**Written** — the next compose uses scale ${scale}% and weight ${weight}.`)
  } else {
    say()
    say('_Dry run — rerun with `--write` (or the workflow\'s `write` input) to use this calibration._')
  }
  finish()
}

function finish() {
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) appendFileSync(summary, `${out.join('\n')}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
