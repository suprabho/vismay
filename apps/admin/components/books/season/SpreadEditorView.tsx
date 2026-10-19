'use client'

import { useEffect, useMemo, useState } from 'react'
import { CaretDown, CaretLeft, CaretRight, CaretUp, Lightning, Plus, Star } from '@phosphor-icons/react'
import { findBeats, type BeatSuggestion } from '@/lib/seasonBooks/matches'
import { BEAT_KINDS, chapterLabel } from '@/lib/seasonBooks/plan'
import {
  advanceBookStatus, BOOK_SPREAD_STATUSES, editorTabsFor, openBlockers, sameClub, SPREAD_KINDS, SPREAD_MODULES, spreadIssues, spreadRow, STATUS_META,
  type BookSpread, type BookSpreadStatus, type EditorTabId, type PlannedSpread, type SpreadModule,
} from '@/lib/seasonBooks/seasonSpreads'
import type { SeasonBookViewProps } from '../BookWorkspace'
import { BUTTON, ICON_BUTTON, PANEL, SELECT } from '../shared'
import { EditorTabPanel } from './EditorTabs'
import { SpreadCanvas } from './SpreadCanvas'
import { useSubjectData, type SubjectData } from './useBookData'

/** Everything a tab panel needs: the spread, its row, the one way to change it, and the subject's match data. */
export interface TabProps {
  spread: PlannedSpread
  row: BookSpread
  seasonStart: number
  plan: SeasonBookViewProps['plan']
  update: (fn: (row: BookSpread) => BookSpread) => void
  data: SubjectData
  /** The field to focus when the tab opens (a `data-field` value). */
  field: string | null
}

/**
 * Step 3: work one spread. The full-size render on the left, its fields on
 * the right in tabs: Story, Moments, the template's own tabs, Modules, Colour
 * and marks, Checks. Clicking a module on the render opens the tab and field
 * that drive it. Angles (the beat finder pointed at this subject's matches)
 * sits above the tabs and proposes candidates; it never writes to the spread
 * on its own.
 */
export function SpreadEditorView({ plan, seasonStart, edit, spreads, spread, tab, setTab, field, openSpread }: SeasonBookViewProps & {
  spreads: PlannedSpread[]
  spread: PlannedSpread | null
  tab: EditorTabId
  setTab: (tab: EditorTabId) => void
  field: string | null
}) {
  const data = useSubjectData(spread)
  const row = useMemo(() => spread ? spreadRow(plan, spread) : null, [plan, spread])
  const tabs = useMemo(() => spread ? editorTabsFor(spread.kind) : [], [spread])
  // A tab the template doesn't have falls back to Story.
  useEffect(() => { if (spread && !tabs.some(t => t.id === tab)) setTab('story') }, [spread, tabs, tab, setTab])

  if (!spread || !row) return <p className="px-6 py-10 text-sm text-neutral-500">No spreads yet: set the roster first.</p>
  const index = spreads.indexOf(spread)
  const issues = spreadIssues(row, seasonStart)
  const blockers = openBlockers(row, seasonStart)
  const update = (fn: (r: BookSpread) => BookSpread) => edit(p => {
    const current = spreadRow(p, spread)
    const next = fn(current)
    // A status picked by hand stands; otherwise the row's content moves it on.
    return { ...p, spreads: { ...p.spreads, [spread.key]: next.status === current.status ? { ...next, status: advanceBookStatus(next) } : next } }
  })
  const onModule = (m: SpreadModule) => openSpread(spread.key, m.tab, m.field ?? m.id)
  // The module a field click came from, outlined on the render.
  const activeModule = field ? SPREAD_MODULES[spread.kind].find(m => m.id === field || m.field === field)?.id ?? null : null
  const canCheck = blockers.length === 0
  const issuesOn = (id: EditorTabId) => issues.filter(i => i.tab === id).length
  const tabProps: TabProps = { spread, row, seasonStart, plan, update, data, field }

  return (
    <div className="mx-auto grid max-w-[110rem] gap-5 px-4 py-6 sm:px-6 xl:grid-cols-[15rem_minmax(0,1fr)_28rem]">
      <nav className="h-fit space-y-0.5 xl:sticky xl:top-4 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto" aria-label="Spreads">
        {spreads.map((s, i) => {
          const r = spreadRow(plan, s)
          const warn = spreadIssues(r, seasonStart).length
          const showPart = i === 0 || spreads[i - 1].part !== s.part
          return (
            <div key={s.key}>
              {showPart && <div className="mb-1 mt-3 px-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500 first:mt-0">{s.partLabel}</div>}
              <button type="button" onClick={() => openSpread(s.key, tab)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${s.key === spread.key ? 'bg-white/10 text-white' : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'}`}>
                <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold ${SPREAD_KINDS[s.kind].className}`}>{SPREAD_KINDS[s.kind].letter}</span>
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_META[r.status].dot}`} title={BOOK_SPREAD_STATUSES[r.status]} />
                {warn > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title={`${warn} to fix`} />}
              </button>
            </div>
          )
        })}
      </nav>

      <article className="min-w-0 space-y-4">
        <header className="flex flex-wrap items-center gap-2">
          <button type="button" className={ICON_BUTTON} disabled={index <= 0} onClick={() => openSpread(spreads[index - 1].key, tab)} title="Previous spread"><CaretLeft size={16} /></button>
          <button type="button" className={ICON_BUTTON} disabled={index >= spreads.length - 1} onClick={() => openSpread(spreads[index + 1].key, tab)} title="Next spread"><CaretRight size={16} /></button>
          <h2 className="mr-auto text-lg font-semibold text-white">
            {spread.label} <span className="font-normal text-neutral-500">· {SPREAD_KINDS[spread.kind].label} · {spread.partLabel}{spread.reason ? ` · ${spread.reason}` : ''}</span>
          </h2>
          <span className="text-xs text-neutral-500">{row.templateVersion}</span>
          <select className={SELECT} value={row.status} aria-label="Status" title={`${STATUS_META[row.status].by}: ${STATUS_META[row.status].means}`}
            onChange={e => update(r => ({ ...r, status: e.target.value as BookSpreadStatus }))}>
            {(Object.keys(BOOK_SPREAD_STATUSES) as BookSpreadStatus[]).map(k => (
              <option key={k} value={k} disabled={(k === 'checked' && !canCheck) || k === 'handed-off'}>
                {BOOK_SPREAD_STATUSES[k]}{k === 'checked' && !canCheck ? ` · ${blockers.length} blocking` : k === 'handed-off' ? ' · by export' : ''}
              </option>
            ))}
          </select>
        </header>
        <SpreadCanvas spread={spread} row={row} seasonStart={seasonStart} onModule={onModule} activeModule={activeModule}
          className="w-full rounded-md shadow-lg shadow-black/40" />
        <p className="text-xs text-neutral-500">
          {data.competition
            ? data.entry?.status === 'ready' ? `${data.rows.length} ${data.competition} matches loaded; charts draw from the spread’s data pack once the pack worker runs.` : data.entry?.status === 'error' ? data.entry.error : `Reading ${data.competition}…`
            : 'No competition data for this spread.'}
          {' '}Click a module to open the tab that drives it.
        </p>
      </article>

      <aside className="space-y-3 xl:sticky xl:top-4 xl:h-fit xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        <Angles spread={spread} data={data} plan={plan} seasonStart={seasonStart} update={update} />
        <div className={`${PANEL} overflow-hidden`}>
          <nav className="flex flex-wrap gap-0.5 border-b border-white/10 p-1" aria-label="Spread fields">
            {tabs.map(t => {
              const n = issuesOn(t.id)
              return (
                <button key={t.id} type="button" onClick={() => setTab(t.id)} title={t.fields}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${tab === t.id ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}>
                  {t.label}
                  {n > 0 && <span className="rounded-full bg-amber-400/15 px-1 text-[10px] tabular-nums text-amber-300">{n}</span>}
                </button>
              )
            })}
          </nav>
          <div className="p-3">
            <EditorTabPanel tab={tab} {...tabProps} />
          </div>
        </div>
      </aside>
    </div>
  )
}

/** The beat finder pointed at this subject's matches: headline and moment candidates, plus the book's beats keyed to it. */
function Angles({ spread, data, plan, seasonStart, update }: { spread: PlannedSpread; data: SubjectData; plan: SeasonBookViewProps['plan']; seasonStart: number; update: TabProps['update'] }) {
  const [open, setOpen] = useState(true)
  const suggestions = useMemo<BeatSuggestion[]>(() => {
    if (!data.competition || data.entry?.status !== 'ready') return []
    const all = findBeats(seasonStart, data.competition, data.rows, spread.kind !== 'competition')
    return spread.kind === 'team' ? all.filter(s => s.teams.split('|').some(t => sameClub(t.trim(), spread.subjectId))) : all
  }, [data, spread, seasonStart])
  const beats = plan.beats.filter(b => b.spreadKey === spread.key && b.text.trim())
  const momentsFull = (r: BookSpread) => r.editorial.moments.length >= 4
  const addMoment = (month: string, text: string) => update(r => momentsFull(r) ? r : { ...r, editorial: { ...r.editorial, moments: [...r.editorial.moments, { date: `${month}-01`, text: text.slice(0, 120), eventId: null }] } })
  const takeStory = (text: string) => update(r => r.editorial.story.trim() ? r : { ...r, editorial: { ...r.editorial, story: text.slice(0, 240) } })

  return (
    <div className={`${PANEL} p-3`}>
      <button type="button" className="flex w-full items-center gap-1.5 text-left text-sm font-semibold text-white" onClick={() => setOpen(o => !o)}>
        <Lightning size={15} weight="fill" className="text-amber-300" /> Angles
        <span className="ml-1 text-xs font-normal text-neutral-500">{suggestions.length + beats.length} candidates</span>
        {open ? <CaretUp size={14} className="ml-auto text-neutral-500" /> : <CaretDown size={14} className="ml-auto text-neutral-500" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-neutral-500">Read from {spread.kind === 'team' ? `${spread.subjectId}’s ${data.competition ?? 'league'} games` : `the ${spread.subjectId} results`}: headline and moment candidates. Nothing lands on the spread until you take it.</p>
          {beats.length > 0 && (
            <ul className="space-y-1.5">
              {beats.map(b => (
                <li key={b.id} className="rounded-md border border-white/10 bg-neutral-950/60 p-2 text-xs">
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-500">
                    <span>Book beat{b.month ? ` · ${chapterLabel(b.month, true)}` : ''} · {BEAT_KINDS[b.kind]}</span>
                    <Stars n={b.strength} />
                  </div>
                  <p className="text-neutral-200">{b.text}</p>
                  <div className="mt-1.5 flex gap-1">
                    <button type="button" className={`${BUTTON} py-0.5 text-[11px]`} onClick={() => b.month && addMoment(b.month, b.text)} disabled={!b.month}><Plus size={11} /> Moment</button>
                    <button type="button" className={`${BUTTON} py-0.5 text-[11px]`} onClick={() => takeStory(b.text)}>Story</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.entry?.status === 'ready' && !suggestions.length && <p className="text-xs text-neutral-500">The finder has nothing for this subject.</p>}
          {suggestions.length > 0 && (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {suggestions.map(s => (
                <li key={s.key} className="rounded-md border border-white/10 bg-neutral-950/60 p-2 text-xs">
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-500">
                    <span>{chapterLabel(s.month, true)} · {BEAT_KINDS[s.kind]}</span>
                    <Stars n={s.strength} />
                  </div>
                  <p className="text-neutral-200">{s.text}</p>
                  <div className="mt-1.5 flex items-center gap-1">
                    <button type="button" className={`${BUTTON} py-0.5 text-[11px]`} onClick={() => addMoment(s.month, s.text)}><Plus size={11} /> Moment</button>
                    <button type="button" className={`${BUTTON} py-0.5 text-[11px]`} onClick={() => takeStory(s.text)}>Story</button>
                    <span className="ml-auto truncate text-[10px] text-neutral-600" title={s.evidence}>{s.evidence}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Stars({ n }: { n: number }) {
  return <span className="flex">{[1, 2, 3].map(i => <Star key={i} size={10} weight={i <= n ? 'fill' : 'regular'} className={i <= n ? 'text-amber-300' : 'text-neutral-700'} />)}</span>
}
