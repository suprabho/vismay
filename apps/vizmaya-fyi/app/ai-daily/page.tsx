import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr'
import { listEditions } from '@vismay/content-source/dcEditions'
import type { DcEditionSummary } from '@vismay/content-source/dcEditionTypes'
import { formatEditionDate } from '@vismay/content-source/dcEditionTypes'
import JsonLd from '@/components/JsonLd'
import { buildBreadcrumbJsonLd, buildDailyCollectionJsonLd } from '@/lib/jsonLd'
import { SERIES_HREF, boomScore, editionHref } from './doom-v-boom/components/editionUtils'
import BoomScore from './doom-v-boom/components/BoomScore'
import DailyMasthead from './doom-v-boom/components/DailyMasthead'
import EditionThemeStyle from './doom-v-boom/components/EditionThemeStyle'
import { StaticRing } from './doom-v-boom/components/ScoreRing'
import { loadThemeOverrides } from './doom-v-boom/editionContext'

// The hub for vizmaya's daily series. Doom v Boom is the first; the page is
// a list so a second series is one more card. Re-rendered by the publish hook
// and every 15 minutes, like the series landing.
export const revalidate = 900

const TITLE = 'AI Daily'
const DESCRIPTION =
  'Daily, frozen snapshots of the AI build-out from vizmaya: the previous 24 hours of news and research, composed each morning and never edited after publish.'

export const metadata: Metadata = {
  title: `${TITLE} · vizmaya`,
  description: DESCRIPTION,
  alternates: { canonical: '/ai-daily' },
  openGraph: { type: 'website', title: `${TITLE} · vizmaya`, description: DESCRIPTION, url: '/ai-daily', siteName: 'vizmaya' },
  twitter: { card: 'summary_large_image', title: `${TITLE} · vizmaya`, description: DESCRIPTION },
}

export default async function AiDailyHub() {
  const [editions, themeOverrides] = await Promise.all([
    listEditions(4).catch((err) => {
      console.warn(`ai-daily: listEditions failed: ${err}`)
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
            path: '/ai-daily',
            name: TITLE,
            description: DESCRIPTION,
            items: [{ path: SERIES_HREF, name: 'Doom v Boom — the AI Data Centers Daily' }],
          }),
          buildBreadcrumbJsonLd([
            { name: 'Home', url: '/' },
            { name: 'AI Daily', url: '/ai-daily' },
          ]),
        ]}
      />
      <EditionThemeStyle overrides={themeOverrides} />
      <main className="wrap pb-16">
        <DailyMasthead overrides={themeOverrides} crumbs={[{ label: 'AI Daily', href: '/ai-daily' }]} />

        <header className="grid gap-5 pb-14 pt-6">
          <span className="eyebrow">vizmaya · Daily series</span>
          <h1 className="font-[family-name:var(--serif)] text-[clamp(48px,8vw,104px)] leading-[.95]">AI Daily</h1>
          <p className="max-w-[56ch] text-[17px] text-[var(--muted)]">{DESCRIPTION}</p>
        </header>

        <section className="grid gap-6 border-t border-[var(--line)] pt-10" aria-label="Series">
          <article className="grid gap-8 rounded-xl border border-[var(--line)] bg-[var(--elevated)] p-6 sm:p-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
            <div className="grid content-start gap-4">
              <span className="eyebrow">Series 01 · Every morning, 09:00 UTC</span>
              <h2 className="font-[family-name:var(--serif)] text-[clamp(34px,4.5vw,56px)] leading-none">
                <Link href={SERIES_HREF}>Doom v Boom</Link>
              </h2>
              <p className="max-w-[48ch] text-[var(--muted)]">
                The AI Data Centers Daily reads the previous day of data-centre, energy and sustainability news for whether it points to boom or
                doom, and scores it: a Boom Score out of 100, every claim traceable to its source.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href={SERIES_HREF}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 font-[family-name:var(--mono)] text-xs"
                >
                  <span className="text-[var(--accent-ink)]">Explore the series</span>
                  <ArrowRightIcon size={14} className="text-[var(--accent-ink)]" aria-hidden="true" />
                </Link>
                {latest && (
                  <Link
                    href={editionHref(latest.date)}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] px-5 py-2.5 font-[family-name:var(--mono)] text-xs hover:bg-[var(--accent-wash)]"
                  >
                    Today’s edition
                  </Link>
                )}
              </div>
            </div>

            {latest ? (
              <div className="grid content-start gap-5">
                <span className="flex justify-between font-[family-name:var(--mono)] text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">
                  <span>Latest · {formatEditionDate(latest.date)}</span>
                  {latest.number != null && <span>№ {latest.number}</span>}
                </span>
                <BoomScore score={latest.moodScore} />
                <Link href={editionHref(latest.date)} className="font-[family-name:var(--serif)] text-2xl leading-tight hover:underline">
                  {latest.headline}
                </Link>
                {editions.length > 1 && (
                  <ol className="grid border-t border-[var(--line)] pt-3" aria-label="Recent editions">
                    {editions.slice(1, 4).map((e) => (
                      <li key={e.date}>
                        <Link href={editionHref(e.date)} className="grid grid-cols-[4.5rem_2.25rem_1fr] items-center gap-3 py-1.5 hover:underline">
                          <span className="font-[family-name:var(--mono)] text-xs text-[var(--muted)]">
                            {formatEditionDate(e.date, { weekday: false, year: false })}
                          </span>
                          <StaticRing score={e.moodScore} count={48} className="w-9">
                            <span className="font-[family-name:var(--mono)] text-[10.5px] tabular-nums">{boomScore(e.moodScore) ?? '—'}</span>
                          </StaticRing>
                          <span className="truncate text-sm">{e.headline}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : (
              <p className="self-center text-[var(--muted)]">The first edition is on its way.</p>
            )}
          </article>
        </section>
      </main>
    </>
  )
}
