import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr'
import { listEditions } from '@vismay/content-source/dcEditions'
import type { DcEditionSummary } from '@vismay/content-source/dcEditionTypes'
import { formatEditionDate, formatSigned } from '@vismay/content-source/dcEditionTypes'
import JsonLd from '@/components/JsonLd'
import { buildBreadcrumbJsonLd, buildDailyCollectionJsonLd } from '@/lib/jsonLd'
import { SERIES_HREF, boomScore, editionHref } from './components/editionUtils'
import BoomScore from './components/BoomScore'
import DailyMasthead from './components/DailyMasthead'
import EditionThemeStyle from './components/EditionThemeStyle'
import MoodTrend from './components/MoodTrend'
import { StaticRing } from './components/ScoreRing'
import { loadThemeOverrides } from './editionContext'

// The series landing: the latest reading, the trend and the full archive.
// Static, re-rendered on demand by the publish hook
// (/api/ai-data-centers/editions/revalidate) and, as a safety net, every
// 15 minutes — a missed ping delays a new edition by minutes.
export const revalidate = 900

const TITLE = 'Doom v Boom — the AI Data Centers Daily'
const DESCRIPTION =
  'One frozen edition a day: the previous 24 hours of AI data-centre, energy and sustainability news, scored boom or doom, every claim traceable to its source.'
const TREND_DAYS = 30

export const metadata: Metadata = {
  title: `${TITLE} · vizmaya`,
  description: DESCRIPTION,
  alternates: { canonical: SERIES_HREF },
  openGraph: { type: 'website', title: TITLE, description: DESCRIPTION, url: SERIES_HREF, siteName: 'vizmaya' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default async function DoomVBoomLanding() {
  const [editions, themeOverrides] = await Promise.all([
    listEditions(400).catch((err) => {
      console.warn(`ai-daily/doom-v-boom: listEditions failed: ${err}`)
      return [] as DcEditionSummary[]
    }),
    loadThemeOverrides(),
  ])
  const latest = editions[0]

  return (
    <>
      <JsonLd
        data={[
          buildDailyCollectionJsonLd({
            path: SERIES_HREF,
            name: TITLE,
            description: DESCRIPTION,
            items: editions.map((e) => ({ path: editionHref(e.date), name: e.headline })),
          }),
          buildBreadcrumbJsonLd([
            { name: 'Home', url: '/' },
            { name: 'AI Daily', url: '/ai-daily' },
            { name: 'Doom v Boom', url: SERIES_HREF },
          ]),
        ]}
      />
      <EditionThemeStyle overrides={themeOverrides} />
      <main className="wrap pb-6">
        <DailyMasthead
          overrides={themeOverrides}
          crumbs={[
            { label: 'AI Daily', href: '/ai-daily' },
            { label: 'Doom v Boom', href: SERIES_HREF },
          ]}
        />

        {!latest ? (
          <div className="empty">
            <span className="eyebrow">AI Daily · Doom v Boom</span>
            <h1>The first edition is on its way.</h1>
            <p>
              One frozen edition a day, composed at 06:15 UTC from the previous 24 hours of AI, energy and sustainability news and published at
              09:00 UTC. Nothing has been published yet — the live explorer keeps moving in the meantime.
            </p>
            <Link className="cta" href="/ai-data-centers">
              Open the live explorer →
            </Link>
            <Link className="cta" href={`${SERIES_HREF}/sample`}>
              See a sample edition →
            </Link>
          </div>
        ) : (
          <>
            <Hero latest={latest} total={editions.length} />

            <section className="border-t border-[var(--line)] py-14" aria-labelledby="trend-h">
              <div className="chapter-head">
                <h2 id="trend-h">The last {Math.min(TREND_DAYS, editions.length)} mornings</h2>
                <p className="lede">
                  Each ring is a morning: its green share is the boom share of the day’s weighted developments, and the number is that share out
                  of 100 — 50 is balanced. Select a ring to read the edition.
                </p>
              </div>
              <MoodTrend editions={editions.slice(0, TREND_DAYS)} />
            </section>

            <Methodology />

            <Archive editions={editions} />
          </>
        )}
      </main>
    </>
  )
}

function Hero({ latest, total }: { latest: DcEditionSummary; total: number }) {
  return (
    <section className="grid items-start gap-10 pb-14 pt-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      <div className="grid gap-5">
        <span className="eyebrow">AI Daily · Series 01</span>
        <h1 className="font-[family-name:var(--serif)] text-[clamp(44px,7vw,88px)] leading-[.95] tracking-[-.01em]">Doom v Boom</h1>
        <p className="max-w-[52ch] text-[17px] text-[var(--muted)]">{DESCRIPTION}</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href={editionHref(latest.date)}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 font-[family-name:var(--mono)] text-xs"
          >
            <span className="text-[var(--accent-ink)]">Read today’s edition</span>
            <ArrowRightIcon size={14} className="text-[var(--accent-ink)]" aria-hidden="true" />
          </Link>
          <a
            href="#archive"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] px-5 py-2.5 font-[family-name:var(--mono)] text-xs hover:bg-[var(--accent-wash)]"
          >
            All {total} editions
          </a>
          <a
            href="#methodology"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] px-5 py-2.5 font-[family-name:var(--mono)] text-xs hover:bg-[var(--accent-wash)]"
          >
            How it’s scored
          </a>
        </div>
      </div>

      <Link
        href={editionHref(latest.date)}
        className="grid gap-5 rounded-xl border border-[var(--line)] bg-[var(--elevated)] p-6 transition-colors hover:border-[var(--accent-lo)] sm:p-8"
      >
        <span className="flex justify-between font-[family-name:var(--mono)] text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">
          <span>Latest · {formatEditionDate(latest.date)}</span>
          {latest.number != null && <span>№ {latest.number}</span>}
        </span>
        <BoomScore score={latest.moodScore} />
        <span className="font-[family-name:var(--serif)] text-2xl leading-tight">{latest.headline}</span>
        <span className="text-[15px] text-[var(--muted)]">{latest.sub.replace(/\*/g, '')}</span>
        <span className="font-[family-name:var(--mono)] text-[11px] text-[var(--dim)]">
          {latest.counts.stories} stories · {latest.counts.papers} papers
        </span>
      </Link>
    </section>
  )
}

/** How the Boom Score is made — the numbers here mirror dcEditionAssembly's scoring and moodWord's bands. */
const METHOD = [
  {
    title: 'The window',
    body: 'Each edition covers 24 hours, 06:15 to 06:15 UTC: news about AI, data centres, chips, energy and sustainability, plus new arXiv research. A classifier keeps what is relevant and tags every report with its AI layer, place, the figures it states, and whether it points to boom, doom or neither.',
  },
  {
    title: 'Events, not headlines',
    body: 'Ten outlets covering one announcement is one development, not ten votes. Reports are grouped into events by what they describe — the same actors, place and figures — and each event takes the majority mood of its reports. An even split counts as neutral. (The earliest editions, before events, counted each report once.)',
  },
  {
    title: 'Weighted by what matters',
    body: 'Each event is weighted by relevance to the build-out (0.6–1×), by impact graded on its size (about 1× for the smallest to 6× for the largest; a plan or warning grades one step below the same thing done), and by coverage (up to 1.75× for widely reported events).',
  },
  {
    title: 'The score',
    body: 'The reading is the boom weight minus the doom weight, over their sum — from −1 (all doom) to +1 (all boom), neutral events left out. The Boom Score is that reading as a share out of 100: 50 is balanced, 45–55 reads “Balanced”, 35–65 “leaning”, 20–80 “clearly”, and beyond that “decisively”.',
  },
  {
    title: 'Frozen and sourced',
    body: 'The edition is composed each morning and published at 09:00 UTC, then never edited; a correction is a note in the next one. Every number is assembled in code from the stories it cites, and every note links back to them.',
  },
]

function Methodology() {
  return (
    <section id="methodology" className="grid gap-10 border-t border-[var(--line)] py-14 lg:grid-cols-[1fr_2fr] lg:gap-16" aria-labelledby="method-h">
      <div className="chapter-head lg:sticky lg:top-8 lg:self-start">
        <h2 id="method-h">Methodology</h2>
        <p className="lede">How a morning’s news becomes one Boom Score.</p>
        <p className="mt-6 inline-block rounded-md border border-[var(--line)] bg-[var(--elevated)] px-4 py-3 font-[family-name:var(--mono)] text-[13px] leading-relaxed">
          reading = (W<sub>boom</sub> − W<sub>doom</sub>) ÷ (W<sub>boom</sub> + W<sub>doom</sub>)
          <br />
          Boom Score = (reading + 1) ÷ 2 × 100
        </p>
      </div>
      <ol className="grid gap-8">
        {METHOD.map((m, i) => (
          <li key={m.title} className="grid grid-cols-[2.5rem_1fr] gap-x-4 gap-y-2">
            <span className="font-[family-name:var(--mono)] text-xs text-[var(--accent)]">{String(i + 1).padStart(2, '0')}</span>
            <div className="grid gap-2">
              <h3 className="font-[family-name:var(--serif)] text-xl">{m.title}</h3>
              <p className="max-w-[62ch] text-[15px] text-[var(--muted)]">{m.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Every published edition, newest first, grouped by month. */
function Archive({ editions }: { editions: DcEditionSummary[] }) {
  const months = new Map<string, DcEditionSummary[]>()
  for (const e of editions) {
    const key = e.date.slice(0, 7)
    months.set(key, [...(months.get(key) ?? []), e])
  }
  return (
    <section id="archive" className="scroll-mt-6 border-t border-[var(--line)] py-14" aria-labelledby="archive-h">
      <div className="chapter-head">
        <h2 id="archive-h">Every edition</h2>
      </div>
      <div className="grid gap-10">
        {[...months].map(([month, rows]) => (
          <div key={month} className="grid gap-2">
            <h3 className="eyebrow pb-2">{formatMonth(month)}</h3>
            <ul className="grid">
              {rows.map((e) => (
                <li key={e.date} className="border-t border-[var(--line)]">
                  <Link
                    href={editionHref(e.date)}
                    className="grid grid-cols-[5.5rem_2.75rem_1fr] items-center gap-x-3 gap-y-1 py-3 sm:grid-cols-[6.5rem_3rem_3rem_1fr_auto] sm:gap-x-4 transition-colors hover:bg-[var(--accent-wash)]"
                  >
                    <span className="whitespace-nowrap font-[family-name:var(--mono)] text-xs text-[var(--muted)]">
                      {formatEditionDate(e.date, { year: false })}
                    </span>
                    <span className="hidden font-[family-name:var(--mono)] text-xs text-[var(--dim)] sm:inline">
                      {e.number != null ? `№ ${e.number}` : ''}
                    </span>
                    <StaticRing score={e.moodScore} count={56} className="w-11">
                      <span className="font-[family-name:var(--mono)] text-[11px] tabular-nums" title={`Boom Score · ${formatSigned(e.moodScore)}`}>
                        {boomScore(e.moodScore) ?? '—'}
                      </span>
                    </StaticRing>
                    <span className="font-[family-name:var(--serif)] text-[17px] leading-snug">{e.headline}</span>
                    <span className="col-start-3 font-[family-name:var(--mono)] text-[10.5px] text-[var(--dim)] sm:col-start-auto">
                      {e.counts.stories} stories · {e.counts.papers} papers
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[m - 1] ?? key} ${y}`
}
