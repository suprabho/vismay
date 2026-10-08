'use client'

import { ArrowSquareOut, ChatCircle, TrendUp, Warning } from '@phosphor-icons/react'
import {
  isTrendSnapshotStale,
  mentions,
  subjectTerms,
  trendAgeHours,
  trendBeatsFor,
  type TrendBeatSnapshot,
  type TrendSnapshot,
} from '@vismay/randomizer/trends'
import type { RandomizerId, SpinSubject } from '@vismay/randomizer/types'

const SHOWN_PER_BEAT = 6

/**
 * What is trending today (the daily Xpoz snapshot, packages/randomizer/src/trends.ts)
 * for the beats this randomizer reads: the same posts the spin's brief opens
 * with. Posts that name the spin on screen are marked.
 */
export function TrendsPanel({
  trends,
  randomizer,
  subject,
}: {
  trends: TrendSnapshot | null
  randomizer: RandomizerId
  subject: SpinSubject | null
}) {
  if (!trends) {
    return (
      <section className="rounded-xl border border-white/10 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-500 flex items-center gap-2">
        <TrendUp size={15} className="text-sky-400 shrink-0" />
        No trend snapshot yet. The daily <code>randomizer-trends</code> workflow reads Xpoz (needs <code>XPOZ_API_KEY</code> and migration
        092); run it from GitHub Actions to fill this.
      </section>
    )
  }

  const beats = trendBeatsFor(randomizer)
    .map((b) => trends.beats.find((s) => s.id === b.id))
    .filter((b): b is TrendBeatSnapshot => !!b)
  const errors = beats.flatMap((b) => b.errors)
  const stale = isTrendSnapshotStale(trends)
  const age = Math.max(0, Math.round(trendAgeHours(trends)))
  const terms = subject ? subjectTerms(subject) : []

  return (
    <section className="rounded-xl border border-white/10 bg-neutral-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium flex items-center gap-1.5">
          <TrendUp size={15} className="text-sky-400" />
          Trending today
        </h2>
        <span className="text-xs text-neutral-500" suppressHydrationWarning>
          Reddit&rsquo;s top threads and the most-engaged X posts on {trends.day}, read {age}h ago via Xpoz. The spin&rsquo;s brief opens with
          these beats as context, never as the subject.
        </span>
        {stale && <span className="text-xs text-amber-300">stale: the daily job has not run since</span>}
        {errors.length > 0 && (
          <span
            className="text-xs text-red-300 border border-red-400/40 bg-red-500/10 rounded-full px-2 py-0.5 inline-flex items-center gap-1"
            title={errors.join('\n')}
          >
            <Warning size={12} /> {errors.length} {errors.length === 1 ? 'source' : 'sources'} failed
          </span>
        )}
      </div>
      <div className="grid gap-px bg-white/5 md:grid-cols-2">
        {beats.map((b) => (
          <div key={b.id} className="bg-neutral-950/60 px-4 py-3 min-w-0">
            <h3 className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono mb-2">{b.label}</h3>
            {b.items.length ? (
              <ul className="space-y-2">
                {b.items.slice(0, SHOWN_PER_BEAT).map((item) => {
                  const hit = terms.some((t) => mentions(item.title, t))
                  return (
                    <li key={item.url} className={`text-xs leading-snug ${hit ? 'rounded-md bg-sky-500/10 ring-1 ring-sky-400/40 px-2 py-1 -mx-2' : ''}`}>
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-neutral-200 hover:text-white inline-flex gap-1">
                        <span className="line-clamp-2">{item.title}</span>
                        <ArrowSquareOut size={11} className="shrink-0 mt-0.5 text-neutral-500" />
                      </a>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-neutral-500">
                        <span>{item.where}</span>
                        <span className="tabular-nums">
                          {item.score.toLocaleString()} {item.platform === 'reddit' ? 'up' : 'likes'}
                        </span>
                        <span className="tabular-nums inline-flex items-center gap-0.5">
                          <ChatCircle size={11} /> {item.comments.toLocaleString()}
                        </span>
                        {hit && <span className="text-sky-300">names this spin</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-xs text-neutral-600">{b.errors.length ? 'Could not be read today.' : 'Nothing today.'}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
