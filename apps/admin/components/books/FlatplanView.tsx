'use client'

import { useMemo, useRef, useState } from 'react'
import { CaretLeft, CaretRight, DotsSixVertical, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import {
  SPREAD_STATUSES, bookChapters, cardIssues, chapterLabel, emptySpread, nextTemplate, pacingIssues, seasonLabel, templateForBeat,
  type Beat, type Plan, type Spread,
} from '@/lib/seasonBooks/plan'
import { ROLE_META, TEMPLATES, TEMPLATE_ORDER, type SpreadRole, type TemplateId } from '@/lib/seasonBooks/system'
import type { BookViewProps } from './BookWorkspace'
import { ICON_BUTTON, IssueList, PANEL, RoleBadge, SELECT } from './shared'
import { SpreadThumb } from './SpreadThumb'

const STATUS_DOT: Record<keyof typeof SPREAD_STATUSES, string> = {
  beat: 'bg-neutral-600',
  card: 'bg-sky-400',
  thumb: 'bg-violet-400',
  data: 'bg-amber-400',
  final: 'bg-emerald-400',
}

type Drag = { kind: 'spread'; id: string } | { kind: 'beat'; id: string }

/** Move spread `id` into `chapter`, before spread `beforeId` (or to the chapter's end). */
function moveSpread(plan: Plan, id: string, chapter: string, beforeId: string | null): Plan {
  const spread = plan.spreads.find(s => s.id === id)
  if (!spread || id === beforeId) return plan
  const rest = plan.spreads.filter(s => s.id !== id)
  const moved = { ...spread, chapter }
  const at = beforeId ? rest.findIndex(s => s.id === beforeId) : -1
  if (at >= 0) rest.splice(at, 0, moved)
  else {
    const lastInChapter = rest.map(s => s.chapter).lastIndexOf(chapter)
    rest.splice(lastInChapter >= 0 ? lastInChapter + 1 : rest.length, 0, moved)
  }
  return { ...plan, spreads: rest }
}

/**
 * Step 2: the flatplan. Every spread of the book on one grid, a row per
 * chapter, numbered in reading order, each with its beat. This is where the
 * book is paced: hero → dense → breather → repeat.
 */
export function FlatplanView({ plan, seasonStart, title, edit, openSpread }: BookViewProps) {
  // A ref, not state: dragover fires before a re-render would land.
  const drag = useRef<Drag | null>(null)
  const startDrag = (e: React.DragEvent, d: Drag) => {
    drag.current = d
    e.dataTransfer.effectAllowed = 'move'
    // Firefox only starts a drag that carries data.
    e.dataTransfer.setData('text/plain', d.id)
  }
  const endDrag = () => { drag.current = null; setOver(null) }
  const [over, setOver] = useState<string | null>(null)
  const chapters = bookChapters(seasonStart)
  const numbers = new Map(plan.spreads.map((s, i) => [s.id, i + 1]))
  const beats = new Map(plan.beats.map(b => [b.id, b]))
  const pacing = useMemo(() => pacingIssues(seasonStart, plan.spreads), [seasonStart, plan.spreads])
  const flagged = new Set(pacing.filter(i => i.severity === 'warn').flatMap(i => i.spreads ?? []))
  const placed = new Set(plan.spreads.map(s => s.beatId))
  const unplaced = plan.beats.filter(b => b.text.trim() && !placed.has(b.id))

  const update = (id: string, patch: Partial<Spread>) => edit(p => ({ ...p, spreads: p.spreads.map(s => s.id === id ? { ...s, ...patch } : s) }))
  const remove = (s: Spread) => {
    if ((s.headline || s.body || s.chart.sketch.length) && !window.confirm(`Delete spread ${numbers.get(s.id)} and its card?`)) return
    edit(p => ({ ...p, spreads: p.spreads.filter(x => x.id !== s.id) }))
  }
  const addTo = (chapter: string, template?: TemplateId, beat?: Beat, beforeId: string | null = null) => edit(p => {
    const inChapter = p.spreads.filter(s => s.chapter === chapter)
    const spread = emptySpread(chapter, template ?? nextTemplate(inChapter[inChapter.length - 1] ?? p.spreads.filter(s => chapters.indexOf(s.chapter) < chapters.indexOf(chapter)).pop()), beat)
    const withNew = { ...p, spreads: [...p.spreads, spread] }
    return beforeId ? moveSpread(withNew, spread.id, chapter, beforeId) : withNew
  })
  const nudge = (s: Spread, dir: -1 | 1) => {
    const i = plan.spreads.findIndex(x => x.id === s.id)
    const j = i + dir
    if (j < 0 || j >= plan.spreads.length) return
    const other = plan.spreads[j]
    // Past the chapter edge, the spread moves into the next chapter instead.
    if (other.chapter !== s.chapter) return update(s.id, { chapter: other.chapter })
    edit(p => {
      const spreads = [...p.spreads]
      ;[spreads[i], spreads[j]] = [spreads[j], spreads[i]]
      return { ...p, spreads }
    })
  }
  const drop = (chapter: string, beforeId: string | null) => {
    const d = drag.current
    endDrag()
    if (!d) return
    if (d.kind === 'spread') edit(p => moveSpread(p, d.id, chapter, beforeId))
    else {
      const beat = beats.get(d.id)
      if (beat) addTo(chapter, templateForBeat(beat), beat, beforeId)
    }
  }

  return (
    <div className="mx-auto max-w-[96rem] space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Flatplan</h2>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            Every spread on one grid: cover, season intro, then each month as a run of spreads. Pace it: hero → dense data → breather → repeat.
            Readers who flip need rhythm more than continuity. Drag spreads to reorder or move them between months; drag a beat in to give it a spread.
          </p>
        </div>
        <Legend />
      </div>

      <RhythmStrip spreads={plan.spreads} flagged={flagged} onOpen={openSpread} />
      <IssueList issues={pacing} empty={plan.spreads.length > 4 ? 'The rhythm holds.' : undefined} />

      {unplaced.length > 0 && (
        <div className={`${PANEL} p-3`}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Beats without a spread · drag onto a month, or click to place in its own month</h3>
          <div className="flex flex-wrap gap-2">
            {unplaced.map(b => (
              <button key={b.id} type="button" draggable onDragStart={e => startDrag(e, { kind: 'beat', id: b.id })} onDragEnd={endDrag}
                onClick={() => addTo(b.month ?? chapters[2], templateForBeat(b), b)}
                className="max-w-xs cursor-grab truncate rounded-md border border-white/15 bg-neutral-900 px-2 py-1 text-left text-xs text-neutral-300 hover:border-white/30"
                title={b.text}>
                <span className="mr-1 text-neutral-500">{b.month ? chapterLabel(b.month, true) : '—'}</span>{b.text}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {chapters.map(ch => {
          const spreads = plan.spreads.filter(s => s.chapter === ch)
          const frame = ch === 'cover' || ch === 'intro'
          return (
            <div key={ch}
              onDragOver={e => { if (drag.current) { e.preventDefault(); setOver(`row:${ch}`) } }}
              onDragLeave={() => setOver(o => o === `row:${ch}` ? null : o)}
              onDrop={e => { e.preventDefault(); drop(ch, null) }}
              className={`grid grid-cols-[8rem_minmax(0,1fr)] gap-3 rounded-lg border p-2 transition ${over === `row:${ch}` ? 'border-white/40 bg-white/[0.04]' : 'border-white/[0.06]'}`}>
              <div className="pt-1">
                <div className="text-sm font-medium text-neutral-200">{chapterLabel(ch)}</div>
                <div className="text-xs text-neutral-500">{spreads.length ? `${spreads.length} spread${spreads.length === 1 ? '' : 's'}` : 'Empty'}</div>
              </div>
              <div className="flex flex-wrap items-stretch gap-2">
                {spreads.map(s => (
                  <SpreadTile key={s.id} spread={s} number={numbers.get(s.id)!} beat={s.beatId ? beats.get(s.beatId) : undefined}
                    bookTitle={title} seasonStart={seasonStart} flagged={flagged.has(s.id)} dropTarget={over === `tile:${s.id}`}
                    onDragStart={e => startDrag(e, { kind: 'spread', id: s.id })} onDragEnd={endDrag}
                    onDragOver={e => { if (drag.current) { e.preventDefault(); e.stopPropagation(); setOver(`tile:${s.id}`) } }}
                    onDrop={e => { e.preventDefault(); e.stopPropagation(); drop(ch, s.id) }}
                    onTemplate={template => update(s.id, { template, chart: { ...s.chart, form: TEMPLATES[template].forms.includes(s.chart.form) ? s.chart.form : TEMPLATES[template].forms[0] } })}
                    onNudge={dir => nudge(s, dir)} onOpen={() => openSpread(s.id)} onRemove={() => remove(s)} />
                ))}
                {!(frame && spreads.length) && (
                  <button type="button" onClick={() => addTo(ch, ch === 'cover' ? 'cover' : ch === 'intro' ? 'intro' : undefined)}
                    className="flex min-h-[6.5rem] w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-white/15 text-xs text-neutral-500 hover:border-white/30 hover:text-neutral-300">
                    <Plus size={16} /> Spread
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-neutral-600">{seasonLabel(seasonStart)} · {plan.spreads.length} spreads · {plan.spreads.length * 2} pages before endpapers</p>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-neutral-400">
      {(Object.keys(ROLE_META) as SpreadRole[]).map(r => (
        <span key={r} className="inline-flex items-center gap-1.5">
          <span className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${ROLE_META[r].className}`}>{ROLE_META[r].letter}</span>
          {ROLE_META[r].label}
        </span>
      ))}
    </div>
  )
}

/** The whole book's rhythm in one line: one cell per spread, coloured by role. */
export function RhythmStrip({ spreads, flagged, onOpen, numbers }: { spreads: Spread[]; flagged: Set<string>; onOpen: (id: string) => void; numbers?: Map<string, number> }) {
  if (!spreads.length) return null
  return (
    <div className="flex gap-px overflow-x-auto rounded-md bg-white/5 p-1" role="list" aria-label="Rhythm">
      {spreads.map((s, i) => {
        const prev = spreads[i - 1]
        const role = ROLE_META[TEMPLATES[s.template].role]
        const n = numbers?.get(s.id) ?? i + 1
        return (
          <button key={s.id} type="button" role="listitem" onClick={() => onOpen(s.id)}
            title={`${n} · ${chapterLabel(s.chapter)} · ${TEMPLATES[s.template].label}${s.headline ? `: ${s.headline}` : ''}`}
            className={`relative flex h-8 min-w-7 flex-1 items-center justify-center rounded-sm text-[11px] font-semibold tabular-nums ${role.className} ${flagged.has(s.id) ? 'ring-2 ring-red-400 ring-inset' : ''} ${prev && prev.chapter !== s.chapter ? 'ml-1.5' : ''}`}>
            {n}
          </button>
        )
      })}
    </div>
  )
}

function SpreadTile({ spread, number, beat, bookTitle, seasonStart, flagged, dropTarget, onDragStart, onDragEnd, onDragOver, onDrop, onTemplate, onNudge, onOpen, onRemove }: {
  spread: Spread
  number: number
  beat?: Beat
  bookTitle: string
  seasonStart: number
  flagged: boolean
  dropTarget: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onTemplate: (t: TemplateId) => void
  onNudge: (dir: -1 | 1) => void
  onOpen: () => void
  onRemove: () => void
}) {
  const warns = cardIssues(spread).filter(i => i.severity === 'warn').length
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop}
      className={`group relative flex w-52 flex-col gap-1.5 rounded-md border bg-neutral-950 p-1.5 transition ${dropTarget ? 'border-l-4 border-l-white border-white/30' : flagged ? 'border-red-400/60' : 'border-white/10 hover:border-white/25'}`}>
      <button type="button" onClick={onOpen} className="block" title="Open the spread card">
        <SpreadThumb spread={spread} template={spread.template} number={number} bookTitle={bookTitle} seasonLabel={seasonLabel(seasonStart)} />
      </button>
      <div className="flex items-center gap-1.5">
        <DotsSixVertical size={14} className="shrink-0 cursor-grab text-neutral-600" />
        <RoleBadge template={spread.template} number={number} />
        <select value={spread.template} onChange={e => onTemplate(e.target.value as TemplateId)} aria-label="Template"
          className={`${SELECT} min-w-0 flex-1 px-1 py-0.5 text-xs`}>
          {TEMPLATE_ORDER.map(t => <option key={t} value={t}>{TEMPLATES[t].label}</option>)}
        </select>
        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[spread.status]}`} title={SPREAD_STATUSES[spread.status]} />
      </div>
      <p className="line-clamp-2 min-h-[2rem] text-xs text-neutral-300" title={spread.headline || beat?.text}>
        {spread.headline || (beat ? <span className="text-neutral-500">{beat.text}</span> : <span className="text-neutral-600">No beat yet</span>)}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex">
          <button type="button" className={ICON_BUTTON} title="Move earlier" onClick={() => onNudge(-1)}><CaretLeft size={13} /></button>
          <button type="button" className={ICON_BUTTON} title="Move later" onClick={() => onNudge(1)}><CaretRight size={13} /></button>
        </div>
        {warns > 0 && <span className="text-[11px] text-amber-300">{warns} to fix</span>}
        <div className="flex">
          <button type="button" className={ICON_BUTTON} title="Edit card" onClick={onOpen}><PencilSimple size={13} /></button>
          <button type="button" className={ICON_BUTTON} title="Delete spread" onClick={onRemove}><Trash size={13} /></button>
        </div>
      </div>
    </div>
  )
}
