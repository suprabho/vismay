'use client'

import { useMemo, useState } from 'react'
import { Database } from '@phosphor-icons/react'
import {
  BOOK_SPREAD_STATUSES, openBlockers, SPREAD_KINDS, spreadIssues, spreadRow, STATUS_META,
  type BookIssue, type BookSpreadStatus, type PlannedSpread, type SpreadKind,
} from '@/lib/seasonBooks/seasonSpreads'
import type { SeasonBookViewProps } from '../BookWorkspace'
import { SELECT } from '../shared'
import { SpreadCanvas } from './SpreadCanvas'

/**
 * Step 2: every spread as a live thumbnail, grouped by part: kind, status,
 * pack freshness, check count. Click one to work it in the Editor.
 */
export function SpreadsView({ plan, seasonStart, spreads, issues, openSpread }: SeasonBookViewProps & { spreads: PlannedSpread[]; issues: BookIssue[] }) {
  const [kind, setKind] = useState<'all' | SpreadKind>('all')
  const [status, setStatus] = useState<'all' | BookSpreadStatus>('all')
  const rows = useMemo(() => spreads.map(s => ({ s, row: spreadRow(plan, s) })), [spreads, plan])
  const shown = rows.filter(({ s, row }) => (kind === 'all' || s.kind === kind) && (status === 'all' || row.status === status))
  const parts = [...new Map(shown.map(({ s }) => [s.part, s.partLabel.split(' · ')[0]])).entries()]
  const counts = Object.fromEntries((Object.keys(BOOK_SPREAD_STATUSES) as BookSpreadStatus[]).map(k => [k, rows.filter(r => r.row.status === k).length])) as Record<BookSpreadStatus, number>
  const bookWarnings = issues.filter(i => i.view === 'spreads')

  return (
    <div className="mx-auto max-w-[96rem] space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Spreads</h2>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            Every league, team and competition spread the roster calls for, grouped by part. The thumbnails are the templates’ module layout on the
            1190 × 842 pt canvas; the charts draw once each spread has its data pack.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={SELECT} value={kind} onChange={e => setKind(e.target.value as typeof kind)} aria-label="Kind">
            <option value="all">All kinds</option>
            {(Object.keys(SPREAD_KINDS) as SpreadKind[]).map(k => <option key={k} value={k}>{SPREAD_KINDS[k].label}s</option>)}
          </select>
          <select className={SELECT} value={status} onChange={e => setStatus(e.target.value as typeof status)} aria-label="Status">
            <option value="all">All statuses</option>
            {(Object.keys(BOOK_SPREAD_STATUSES) as BookSpreadStatus[]).map(k => <option key={k} value={k}>{BOOK_SPREAD_STATUSES[k]} · {counts[k]}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-neutral-400">
        {(Object.keys(BOOK_SPREAD_STATUSES) as BookSpreadStatus[]).map(k => (
          <span key={k} className="inline-flex items-center gap-1.5" title={`${STATUS_META[k].by}: ${STATUS_META[k].means}`}>
            <span className={`h-2 w-2 rounded-full ${STATUS_META[k].dot}`} /> {BOOK_SPREAD_STATUSES[k]} <span className="tabular-nums text-neutral-600">{counts[k]}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-neutral-500"><Database size={12} /> pack · not built (the pack worker is not wired yet)</span>
      </div>
      {bookWarnings.length > 0 && <ul className="space-y-1 text-sm text-amber-300">{bookWarnings.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}

      {!spreads.length && <p className="text-sm text-neutral-500">No spreads yet: set the roster first.</p>}
      {parts.map(([part, label]) => {
        const inPart = shown.filter(({ s }) => s.part === part)
        return (
          <section key={part} className="space-y-3">
            <h3 className="text-base font-semibold text-neutral-100">{label} <span className="text-sm font-normal text-neutral-500">· {inPart.length} spread{inPart.length === 1 ? '' : 's'}</span></h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {inPart.map(({ s, row }) => {
                const warns = spreadIssues(row, seasonStart).length
                const blockers = openBlockers(row, seasonStart).length
                return (
                  <button key={s.key} type="button" onClick={() => openSpread(s.key)} className="group text-left">
                    <SpreadCanvas spread={s} row={row} seasonStart={seasonStart} compact
                      className={`w-full rounded-[3px] shadow-md shadow-black/40 transition group-hover:-translate-y-0.5 ${blockers ? 'outline outline-2 outline-red-400' : ''}`} />
                    <div className="mt-1.5 flex items-center gap-2 text-xs">
                      <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold ${SPREAD_KINDS[s.kind].className}`} title={SPREAD_KINDS[s.kind].label}>{SPREAD_KINDS[s.kind].letter}</span>
                      <span className="min-w-0 flex-1 truncate text-neutral-200" title={s.label}>{s.label}</span>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_META[row.status].dot}`} title={BOOK_SPREAD_STATUSES[row.status]} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500">
                      <span>{SPREAD_KINDS[s.kind].template}</span>
                      <span>· {row.pack ? `pack ${row.pack.hash.slice(0, 6)}` : 'no pack'}</span>
                      {warns > 0 && <span className={`ml-auto ${blockers ? 'text-red-300' : 'text-amber-300'}`}>{warns} check{warns === 1 ? '' : 's'}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
