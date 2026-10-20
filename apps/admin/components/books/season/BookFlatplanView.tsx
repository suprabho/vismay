'use client'

import { seasonLabel } from '@/lib/seasonBooks/plan'
import {
  KDP_PAGE_LIMIT, pageCount, PAGES_PER_SPREAD, PART_LABELS, SPREAD_KINDS, spreadRow, STATUS_META,
  type BookIssue, type PlannedSpread,
} from '@/lib/seasonBooks/seasonSpreads'
import type { SeasonBookViewProps } from '../BookWorkspace'
import { PANEL } from '../shared'
import { SpreadThumb } from '../SpreadThumb'
import { SpreadCanvas } from './SpreadCanvas'

/**
 * Step 4: the whole book as page pairs in reading order, with part dividers,
 * page numbers and the total against the KDP limit. The order is fixed by the
 * parts (Introduction → leagues → European → domestic → honourable mentions →
 * Season in numbers); clubs follow the roster's order.
 */
export function BookFlatplanView({ plan, seasonStart, title, spreads, issues, openSpread }: SeasonBookViewProps & { spreads: PlannedSpread[]; issues: BookIssue[] }) {
  const pages = pageCount(plan)
  const pct = Math.min(100, (pages / KDP_PAGE_LIMIT) * 100)
  type Row = { key: string; label: string; part: string; partLabel: string; node: React.ReactNode; onOpen?: () => void; status?: string }
  const frame = (key: 'cover' | 'intro' | 'outro', label: string, partLabel: string): Row => ({
    key: `frame:${key}`, label, part: key === 'outro' ? 'outro' : 'intro', partLabel,
    node: <SpreadThumb spread={plan.frame[key]} template={plan.frame[key].template} bookTitle={title} seasonLabel={seasonLabel(seasonStart)} className="shadow-md shadow-black/40" />,
  })
  const rows: Row[] = [
    frame('cover', plan.frame.cover.headline || 'Cover', PART_LABELS.intro),
    frame('intro', plan.frame.intro.headline || 'Season intro', PART_LABELS.intro),
    ...spreads.map(s => {
      const row = spreadRow(plan, s)
      return {
        key: s.key, label: s.label, part: s.part, partLabel: s.partLabel, status: row.status, onOpen: () => openSpread(s.key),
        node: <SpreadCanvas spread={s} row={row} seasonStart={seasonStart} compact className="w-full rounded-[3px] shadow-md shadow-black/40" />,
      } satisfies Row
    }),
    frame('outro', plan.frame.outro.headline || 'Season in numbers', PART_LABELS.outro),
  ]
  const flatplanIssues = issues.filter(i => i.view === 'flatplan')

  return (
    <div className="mx-auto max-w-[96rem] space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Flatplan</h2>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            The book as page pairs in reading order. The part order is fixed; clubs sit by final position unless the roster pins them.
            Change what’s in the book on the Roster; this view shows where every spread lands.
          </p>
        </div>
        <div className={`${PANEL} w-72 p-3`}>
          <div className="flex justify-between text-xs tabular-nums text-neutral-400">
            <span>{rows.length} spreads · {pages} pages</span><span>KDP {KDP_PAGE_LIMIT}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full ${pages > KDP_PAGE_LIMIT ? 'bg-red-400' : pages > KDP_PAGE_LIMIT * 0.9 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-neutral-500">Premium colour hardcover, 550-page limit; cost per copy rises with page count.</div>
        </div>
      </div>
      {flatplanIssues.length > 0 && <ul className="space-y-1 text-sm text-red-300">{flatplanIssues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}

      <div className="space-y-2">
        {rows.map((r, i) => {
          const divider = i === 0 || rows[i - 1].part !== r.part
          const first = i * PAGES_PER_SPREAD + 1
          return (
            <div key={r.key}>
              {divider && <div className="mb-2 mt-5 flex items-center gap-3 first:mt-0"><span className="text-xs font-medium uppercase tracking-wider text-neutral-500">{r.partLabel}</span><span className="h-px flex-1 bg-white/10" /></div>}
              <div className="grid grid-cols-[3.5rem_14rem_minmax(0,1fr)] items-center gap-3 rounded-lg border border-white/[0.06] p-2 hover:border-white/15">
                <div className="text-right text-xs tabular-nums text-neutral-500">{first}–{first + 1}</div>
                <button type="button" onClick={r.onOpen} disabled={!r.onOpen} className="text-left">{r.node}</button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {r.key.startsWith('frame:')
                      ? <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-neutral-400 text-[11px] font-semibold text-neutral-950">F</span>
                      : <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold ${SPREAD_KINDS[spreads.find(s => s.key === r.key)!.kind].className}`}>{SPREAD_KINDS[spreads.find(s => s.key === r.key)!.kind].letter}</span>}
                    <span className="truncate text-sm text-neutral-200">{r.label}</span>
                    {r.status && <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_META[r.status as keyof typeof STATUS_META].dot}`} />}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">{r.partLabel}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
