import Link from 'next/link'
import type { DcEditionSummary } from '@vismay/content-source/dcEditionTypes'
import { formatEditionDate, formatSigned, moodWord } from '@vismay/content-source/dcEditionTypes'
import { boomScore, editionHref } from './editionUtils'
import { StaticRing } from './ScoreRing'

/**
 * Recent mornings as small multiples of the Boom Score ring, oldest → newest
 * in reading order: each ring's boom share in --boom, the rest --doom, the
 * score in its centre and the date under it. Each ring is its edition's link;
 * the archive list below is the table view.
 */
export default function MoodTrend({ editions }: { editions: DcEditionSummary[] }) {
  const series = [...editions].reverse()
  if (series.length < 2) return null
  return (
    <ol className="grid grid-cols-4 gap-x-3 gap-y-6 sm:grid-cols-6 lg:grid-cols-10">
      {series.map((e) => {
        const value = boomScore(e.moodScore)
        return (
          <li key={e.date}>
            <Link
              href={editionHref(e.date)}
              title={e.headline}
              aria-label={`${formatEditionDate(e.date)}: Boom Score ${value ?? 'unscored'}, ${moodWord(e.moodScore)} — ${e.headline}`}
              className="group grid justify-items-center gap-1.5 rounded-lg p-1.5 transition-colors hover:bg-[var(--accent-wash)]"
            >
              <StaticRing score={e.moodScore} count={80} className="w-full max-w-[112px] transition-transform duration-300 group-hover:scale-105">
                <span className="font-[family-name:var(--serif)] text-[22cqi] leading-none tabular-nums">{value ?? '—'}</span>
              </StaticRing>
              <span className="font-[family-name:var(--mono)] text-[10.5px] text-[var(--muted)]">
                {formatEditionDate(e.date, { weekday: false, year: false })}
              </span>
              <span className="font-[family-name:var(--mono)] text-[10px] text-[var(--dim)]">{formatSigned(e.moodScore)}</span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
