'use client'

import { bookChapters, chapterLabel, seasonLabel, wordCount } from '@/lib/seasonBooks/plan'
import { TEMPLATES } from '@/lib/seasonBooks/system'
import type { SeasonBookViewProps } from '../BookWorkspace'
import { PANEL, RoleBadge } from '../shared'
import { SpreadThumb } from '../SpreadThumb'

/**
 * A converted book's archived month spreads (plan v1), read-only: the cards
 * are kept for their headlines, charts and copy, never deleted, and nothing
 * here feeds the season spreads on its own.
 */
export function LegacyView({ plan, seasonStart, title }: SeasonBookViewProps) {
  const legacy = plan.legacy ?? []
  const chapters = bookChapters(seasonStart).filter(c => legacy.some(s => s.chapter === c))
  return (
    <div className="mx-auto max-w-[96rem] space-y-5 px-4 py-6 sm:px-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Legacy</h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-400">
          The {legacy.length} claim spreads this book carried before it was converted, by month. Read-only: lift a headline, a stat or a paragraph into a
          season spread by hand.
        </p>
      </div>
      {chapters.map(c => {
        const spreads = legacy.filter(s => s.chapter === c)
        return (
          <section key={c} className="space-y-3">
            <h3 className="text-base font-semibold text-neutral-100">{chapterLabel(c)} <span className="text-sm font-normal text-neutral-500">· {spreads.length} spread{spreads.length === 1 ? '' : 's'}</span></h3>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {spreads.map((s, i) => (
                <div key={s.id} className={`${PANEL} p-3`}>
                  <SpreadThumb spread={s} template={s.template} bookTitle={title} seasonLabel={seasonLabel(seasonStart)} className="shadow-md shadow-black/40" />
                  <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
                    <RoleBadge template={s.template} number={i + 1} />
                    <span>{TEMPLATES[s.template].label}</span>
                    <span className="ml-auto text-neutral-600">{wordCount(s.body)} words</span>
                  </div>
                  {s.headline && <p className="mt-2 text-sm font-semibold text-neutral-100">{s.headline}</p>}
                  {s.stat.value && <p className="mt-1 text-xs text-neutral-400"><span className="font-bold tabular-nums text-neutral-200">{s.stat.value}</span> {s.stat.label}</p>}
                  {s.body && <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-neutral-400">{s.body}</p>}
                  {s.caption && <p className="mt-1 text-[11px] italic text-neutral-500">{s.caption}</p>}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
