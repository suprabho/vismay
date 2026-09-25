import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRightIcon, ClockIcon, LinkSimpleIcon, SnowflakeIcon } from '@phosphor-icons/react/dist/ssr'
import { listEditions } from '@vismay/content-source/dcEditions'
import type { DcEditionSummary } from '@vismay/content-source/dcEditionTypes'
import { formatEditionDate, formatSigned } from '@vismay/content-source/dcEditionTypes'
import JsonLd from '@/components/JsonLd'
import { buildBreadcrumbJsonLd, buildDailyCollectionJsonLd } from '@/lib/jsonLd'
import { SERIES_HREF, boomScore, editionHref } from './components/editionUtils'
import MoodTrend from './components/MoodTrend'
import { ScoreReadout, ScoreTrack, toneColor } from './components/ScoreMeter'

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

const HOW = [
  { Icon: ClockIcon, title: 'Composed at 06:15 UTC', body: 'From the previous 24 hours of AI, energy and sustainability reporting and new research.' },
  { Icon: SnowflakeIcon, title: 'Frozen at 09:00 UTC', body: 'Each edition is published once and never edited; a correction is a note in the next one.' },
  { Icon: LinkSimpleIcon, title: 'Every claim sourced', body: 'Each figure and headline links back to the story or paper it came from.' },
]

export default async function DoomVBoomLanding() {
  const editions = await listEditions(400).catch((err) => {
    console.warn(`ai-daily/doom-v-boom: listEditions failed: ${err}`)
    return [] as DcEditionSummary[]
  })
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
      <main className="wrap pb-6">
        <Masthead />

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
                  The Boom Score is the boom share of the day’s weighted developments — 50 is balanced. Hover or focus a bar for the edition;
                  select it to read it.
                </p>
              </div>
              <MoodTrend editions={editions.slice(0, TREND_DAYS)} />
            </section>

            <section className="grid gap-6 border-t border-[var(--line)] py-14 sm:grid-cols-3" aria-label="How an edition is made">
              {HOW.map(({ Icon, title, body }) => (
                <div key={title} className="grid content-start gap-2">
                  <Icon size={22} weight="light" className="text-[var(--accent)]" aria-hidden="true" />
                  <h3 className="font-[family-name:var(--serif)] text-xl">{title}</h3>
                  <p className="text-sm text-[var(--muted)]">{body}</p>
                </div>
              ))}
            </section>

            <Archive editions={editions} />
          </>
        )}
      </main>
    </>
  )
}

function Masthead() {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 py-6 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">
      <ol className="flex items-center gap-2">
        <li>
          <Link href="/">vizmaya</Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link href="/ai-daily">AI Daily</Link>
        </li>
        <li aria-hidden="true">/</li>
        <li className="text-[var(--bone)]" aria-current="page">
          Doom v Boom
        </li>
      </ol>
      <Link href="/ai-data-centers">Live explorer →</Link>
    </nav>
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
        <ScoreReadout score={latest.moodScore} />
        <ScoreTrack score={latest.moodScore} />
        <span className="flex justify-between font-[family-name:var(--mono)] text-[10px] uppercase tracking-[.1em] text-[var(--dim)]" aria-hidden="true">
          <span>Doom</span>
          <span>Balanced</span>
          <span>Boom</span>
        </span>
        <span className="font-[family-name:var(--serif)] text-2xl leading-tight">{latest.headline}</span>
        <span className="text-[15px] text-[var(--muted)]">{latest.sub.replace(/\*/g, '')}</span>
        <span className="font-[family-name:var(--mono)] text-[11px] text-[var(--dim)]">
          {latest.counts.stories} stories · {latest.counts.papers} papers
        </span>
      </Link>
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
                    className="grid grid-cols-[5.5rem_3rem_1fr] items-baseline gap-x-3 sm:gap-x-4 gap-y-1 py-3.5 transition-colors hover:bg-[var(--accent-wash)] sm:grid-cols-[6.5rem_3rem_4.5rem_1fr_auto]"
                  >
                    <span className="whitespace-nowrap font-[family-name:var(--mono)] text-xs text-[var(--muted)]">
                      {formatEditionDate(e.date, { year: false })}
                    </span>
                    <span className="hidden font-[family-name:var(--mono)] text-xs text-[var(--dim)] sm:inline">
                      {e.number != null ? `№ ${e.number}` : ''}
                    </span>
                    <span className="flex items-center gap-2 font-[family-name:var(--mono)] text-sm tabular-nums">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: toneColor(e.moodScore) }} aria-hidden="true" />
                      <span title={`Boom Score · ${formatSigned(e.moodScore)}`}>{boomScore(e.moodScore) ?? '—'}</span>
                    </span>
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
