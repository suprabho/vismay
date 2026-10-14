'use client'

import { useMemo, useState } from 'react'
import { bookChapters, cardIssues, chapterLabel, pacingIssues, seasonLabel } from '@/lib/seasonBooks/plan'
import { TEMPLATES } from '@/lib/seasonBooks/system'
import type { BookViewProps } from './BookWorkspace'
import { RhythmStrip } from './FlatplanView'
import { IssueList, RoleBadge } from './shared'
import { SpreadThumb } from './SpreadThumb'

/**
 * Step 4: thumbnail whole chapters at once. A month's spreads side by side,
 * low fidelity, so the flow across them can be judged before polishing.
 */
export function ChaptersView({ plan, seasonStart, title, openSpread }: BookViewProps) {
  const chapters = bookChapters(seasonStart).filter(c => plan.spreads.some(s => s.chapter === c))
  const [chapter, setChapter] = useState<string>('all')
  const numbers = new Map(plan.spreads.map((s, i) => [s.id, i + 1]))
  const pacing = useMemo(() => pacingIssues(seasonStart, plan.spreads), [seasonStart, plan.spreads])
  const flagged = new Set(pacing.filter(i => i.severity === 'warn').flatMap(i => i.spreads ?? []))
  const shown = chapter === 'all' ? chapters : chapters.filter(c => c === chapter)
  const single = chapter !== 'all'

  return (
    <div className="mx-auto max-w-[96rem] space-y-5 px-4 py-6 sm:px-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Chapters</h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-400">
          Each month’s spreads side by side, so you judge the flow across them, not one at a time. Once a chapter reads well in thumbnail,
          pull the real data and polish.
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {['all', ...chapters].map(c => (
          <button key={c} type="button" onClick={() => setChapter(c)}
            className={`rounded-full px-3 py-1 text-sm ${chapter === c ? 'bg-white text-neutral-950' : 'text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200'}`}>
            {c === 'all' ? 'Whole book' : chapterLabel(c, true)}
          </button>
        ))}
      </div>
      {!chapters.length && <p className="text-sm text-neutral-500">No spreads on the flatplan yet.</p>}

      {shown.map(c => {
        const spreads = plan.spreads.filter(s => s.chapter === c)
        const ids = new Set(spreads.map(s => s.id))
        const chapterIssues = pacing.filter(i => i.spreads?.some(id => ids.has(id)))
        return (
          <section key={c} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold text-neutral-100">{chapterLabel(c)} <span className="text-sm font-normal text-neutral-500">· {spreads.length} spread{spreads.length === 1 ? '' : 's'}</span></h3>
            </div>
            {single && <RhythmStrip spreads={spreads} flagged={flagged} onOpen={openSpread} numbers={numbers} />}
            <div className={`grid gap-4 ${single ? 'grid-cols-1 md:grid-cols-2 2xl:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'}`}>
              {spreads.map(s => {
                const warns = cardIssues(s).filter(i => i.severity === 'warn').length
                return (
                  <button key={s.id} type="button" onClick={() => openSpread(s.id)} className="group text-left">
                    <SpreadThumb spread={s} template={s.template} number={numbers.get(s.id)} bookTitle={title} seasonLabel={seasonLabel(seasonStart)}
                      className={`shadow-md shadow-black/40 transition group-hover:-translate-y-0.5 ${flagged.has(s.id) ? 'outline outline-2 outline-red-400' : ''}`} />
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-400">
                      <RoleBadge template={s.template} number={numbers.get(s.id)} />
                      <span className="text-neutral-500">{TEMPLATES[s.template].label}</span>
                      {warns > 0 && <span className="ml-auto text-amber-300">{warns} to fix</span>}
                    </div>
                  </button>
                )
              })}
            </div>
            {single && <IssueList issues={chapterIssues} />}
          </section>
        )
      })}
    </div>
  )
}
