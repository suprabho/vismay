import Link from 'next/link'
import type { DcEditionSummary } from '@vismay/content-source/dcEditionTypes'
import { formatEditionDate, formatSigned, moodWord } from '@vismay/content-source/dcEditionTypes'
import { boomScore, editionHref } from './editionUtils'
import { toneColor } from './ScoreMeter'

/**
 * The Boom Score across recent editions, oldest → newest, as bars diverging
 * from the balanced 50 line: boom mornings rise, doom mornings fall. Plain
 * HTML columns (no JS): each column is the edition's link and hover/focus
 * target, taller than its bar, with a tooltip naming the date, score and
 * headline. The archive list below the chart is its table view.
 */
export default function MoodTrend({ editions }: { editions: DcEditionSummary[] }) {
  const series = [...editions].reverse()
  if (series.length < 2) return null
  const n = series.length
  return (
    <figure className="grid gap-3">
      <div className="grid grid-cols-[auto_1fr] gap-3">
        <div
          className="flex flex-col justify-between py-0.5 text-right font-[family-name:var(--mono)] text-[10.5px] text-[var(--dim)]"
          aria-hidden="true"
        >
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
        <div className="relative h-44 sm:h-52">
          <span className="absolute inset-x-0 top-0 border-t border-dashed border-[var(--line)]" aria-hidden="true" />
          <span className="absolute inset-x-0 top-1/2 border-t border-[var(--line-strong)]" aria-hidden="true" />
          <span className="absolute inset-x-0 bottom-0 border-t border-dashed border-[var(--line)]" aria-hidden="true" />
          <ol className="relative flex h-full gap-[2px]">
            {series.map((e, i) => {
              const value = boomScore(e.moodScore)
              const offset = value == null ? 0 : Math.abs(value - 50) * 2 // % of a half
              const up = value != null && value >= 50
              const tipSide = i < n / 3 ? 'left-0' : i > (2 * n) / 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'
              return (
                <li key={e.date} className="group relative min-w-0 flex-1">
                  <Link
                    href={editionHref(e.date)}
                    className="absolute inset-0 rounded-sm group-hover:bg-[var(--accent-wash)] focus-visible:bg-[var(--accent-wash)]"
                    aria-label={`${formatEditionDate(e.date)}: Boom Score ${value ?? 'unscored'} — ${e.headline}`}
                  >
                    {value != null && (
                      <span
                        className={`absolute inset-x-[15%] ${up ? 'bottom-1/2 rounded-t-[4px]' : 'top-1/2 rounded-b-[4px]'}`}
                        style={{ height: `${Math.max(offset, 2) / 2}%`, background: toneColor(e.moodScore) }}
                      />
                    )}
                  </Link>
                  <span
                    className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden w-60 rounded-md border border-[var(--line-strong)] bg-[var(--raised)] p-3 text-left shadow-[var(--shadow)] group-hover:grid group-focus-within:grid ${tipSide} gap-1`}
                    aria-hidden="true"
                  >
                    <span className="font-[family-name:var(--mono)] text-[10.5px] uppercase tracking-[.1em] text-[var(--muted)]">
                      {formatEditionDate(e.date, { year: false })}
                      {e.number != null ? ` · № ${e.number}` : ''}
                    </span>
                    <span className="text-sm">
                      <b className="font-[family-name:var(--serif)] text-lg font-normal">{value ?? '—'}</b> {moodWord(e.moodScore)}{' '}
                      <span className="font-[family-name:var(--mono)] text-xs text-[var(--dim)]">{formatSigned(e.moodScore)}</span>
                    </span>
                    <span className="line-clamp-3 text-[13px] leading-snug text-[var(--muted)]">{e.headline}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
      <figcaption className="flex justify-between gap-4 pl-8 font-[family-name:var(--mono)] text-[10.5px] text-[var(--dim)]">
        <span>{formatEditionDate(series[0].date, { weekday: false })}</span>
        <span className="hidden sm:inline">Above the line: boom mornings · below: doom</span>
        <span>{formatEditionDate(series[n - 1].date, { weekday: false })}</span>
      </figcaption>
    </figure>
  )
}
