'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, Lightning, MagnifyingGlass, Plus, Star, Trash } from '@phosphor-icons/react'
import { findBeats } from '@/lib/seasonBooks/matches'
import {
  BEAT_KINDS, BEAT_TARGET, BOOK_COMPETITIONS, LEAGUE_COMPETITIONS, beatIssues, chapterLabel, emptyBeat, emptySpread,
  seasonMonths, spreadNumbers, templateForBeat, wordCount, type Beat, type BeatKind,
} from '@/lib/seasonBooks/plan'
import type { BookViewProps } from './BookWorkspace'
import { useMatches } from './MatchData'
import { BUTTON, ICON_BUTTON, INPUT, IssueList, PANEL, SELECT } from './shared'

/**
 * Step 1: the season's story beats, before any layout. 15–25 moments or
 * patterns, each one sentence, placed in its month. The beat finder proposes
 * candidates from the match data; the writer keeps, rewrites or drops them.
 */
export function BeatsView({ plan, seasonStart, edit, openSpread }: BookViewProps) {
  const months = seasonMonths(seasonStart)
  const numbers = spreadNumbers(seasonStart, plan.spreads)
  const spreadFor = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of plan.spreads) if (s.beatId && !m.has(s.beatId)) m.set(s.beatId, s.id)
    return m
  }, [plan.spreads])
  const count = plan.beats.filter(b => b.text.trim()).length

  const update = (id: string, patch: Partial<Beat>) => edit(p => ({ ...p, beats: p.beats.map(b => b.id === id ? { ...b, ...patch } : b) }))
  const remove = (id: string) => edit(p => ({
    ...p,
    beats: p.beats.filter(b => b.id !== id),
    spreads: p.spreads.map(s => s.beatId === id ? { ...s, beatId: null } : s),
  }))
  const add = (month: string | null, beat?: Partial<Beat>) => edit(p => ({ ...p, beats: [...p.beats, { ...emptyBeat(month), ...beat }] }))
  const place = (beat: Beat) => {
    const spread = emptySpread(beat.month ?? months[0], templateForBeat(beat), beat)
    edit(p => ({ ...p, spreads: [...p.spreads, spread] }))
    openSpread(spread.id)
  }

  const groups = [...months.map(m => ({ key: m as string | null, label: chapterLabel(m) })), { key: null, label: 'No month yet' }]

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Story beats</h2>
            <p className="mt-1 max-w-2xl text-sm text-neutral-400">
              Find the season’s moments and patterns before any layout: a title race swing, a record, a collapse. Each beat is one sentence,
              like “Arsenal didn’t lose a game, and here’s how close they came.” Three stars means it could open a chapter.
            </p>
          </div>
          <BeatMeter count={count} />
        </div>
        <IssueList issues={beatIssues(plan)} />

        <div className="space-y-3">
          {groups.map(g => {
            const beats = plan.beats.filter(b => b.month === g.key)
            if (g.key === null && !beats.length) return null
            return (
              <div key={g.key ?? 'none'} className={beats.length ? `${PANEL} p-3` : 'px-3'}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className={`text-sm font-medium ${beats.length ? 'text-neutral-200' : 'text-neutral-600'}`}>
                    {g.label}{beats.length > 0 && <span className="ml-2 text-xs text-neutral-500">{beats.length}</span>}
                  </h3>
                  <button type="button" className={ICON_BUTTON} title={`Add a beat to ${g.label}`} onClick={() => add(g.key)}><Plus size={14} /></button>
                </div>
                {beats.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {beats.map(b => (
                      <BeatRow key={b.id} beat={b} months={months} spreadNumber={spreadFor.has(b.id) ? numbers.get(spreadFor.get(b.id)!) : undefined}
                        onChange={patch => update(b.id, patch)} onRemove={() => remove(b.id)}
                        onPlace={() => place(b)} onOpen={() => spreadFor.has(b.id) && openSpread(spreadFor.get(b.id)!)} />
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <BeatFinder seasonStart={seasonStart} existing={plan.beats} onAdd={s => add(s.month, s)} />
    </div>
  )
}

function BeatMeter({ count }: { count: number }) {
  const max = BEAT_TARGET.max + 5
  return (
    <div className="w-56">
      <div className="mb-1 flex justify-between text-xs tabular-nums text-neutral-400">
        <span>{count} beats</span><span>aim {BEAT_TARGET.min}–{BEAT_TARGET.max}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
        <div className="absolute inset-y-0 bg-emerald-400/25" style={{ left: `${(BEAT_TARGET.min / max) * 100}%`, width: `${((BEAT_TARGET.max - BEAT_TARGET.min) / max) * 100}%` }} />
        <div className={`absolute inset-y-0 left-0 rounded-full ${count >= BEAT_TARGET.min && count <= BEAT_TARGET.max ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, (count / max) * 100)}%` }} />
      </div>
    </div>
  )
}

function BeatRow({ beat, months, spreadNumber, onChange, onRemove, onPlace, onOpen }: {
  beat: Beat
  months: string[]
  spreadNumber?: number
  onChange: (patch: Partial<Beat>) => void
  onRemove: () => void
  onPlace: () => void
  onOpen: () => void
}) {
  const words = wordCount(beat.text)
  return (
    <li className="rounded-lg border border-white/10 bg-neutral-950/60 p-2.5">
      <div className="flex items-start gap-2">
        <button type="button" title={`Strength ${beat.strength} of 3 (click to change)`} className="mt-1 flex shrink-0"
          onClick={() => onChange({ strength: ((beat.strength % 3) + 1) as Beat['strength'] })}>
          {[1, 2, 3].map(n => <Star key={n} size={13} weight={n <= beat.strength ? 'fill' : 'regular'} className={n <= beat.strength ? 'text-amber-300' : 'text-neutral-600'} />)}
        </button>
        <textarea value={beat.text} rows={1} maxLength={400} placeholder="One sentence: the moment, and why it matters"
          onChange={e => onChange({ text: e.target.value })}
          className="min-h-[2rem] flex-1 resize-y bg-transparent text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none [field-sizing:content]" />
        <span className={`mt-1 shrink-0 text-[11px] tabular-nums ${words > 28 ? 'text-amber-300' : 'text-neutral-600'}`}>{words}w</span>
        <button type="button" className={ICON_BUTTON} title="Delete beat" onClick={onRemove}><Trash size={14} /></button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select className={`${SELECT} py-1 text-xs`} value={beat.kind} onChange={e => onChange({ kind: e.target.value as BeatKind })} aria-label="Kind">
          {Object.entries(BEAT_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select className={`${SELECT} py-1 text-xs`} value={beat.month ?? ''} onChange={e => onChange({ month: e.target.value || null })} aria-label="Month">
          <option value="">No month</option>
          {months.map(m => <option key={m} value={m}>{chapterLabel(m)}</option>)}
        </select>
        <input className={`${INPUT} w-40 py-1 text-xs`} value={beat.teams} maxLength={200} placeholder="Teams / people" onChange={e => onChange({ teams: e.target.value })} />
        <input className={`${INPUT} min-w-[10rem] flex-1 py-1 text-xs`} value={beat.evidence} maxLength={1000} placeholder="Evidence: where the number comes from" onChange={e => onChange({ evidence: e.target.value })} />
        {spreadNumber != null
          ? <button type="button" className={`${BUTTON} py-1 text-xs`} onClick={onOpen}>Spread {spreadNumber} <ArrowRight size={12} /></button>
          : <button type="button" className={`${BUTTON} py-1 text-xs`} onClick={onPlace} disabled={!beat.text.trim()} title="Add a spread for this beat to the flatplan">
              <Plus size={12} /> Spread
            </button>}
      </div>
    </li>
  )
}

function BeatFinder({ seasonStart, existing, onAdd }: { seasonStart: number; existing: Beat[]; onAdd: (b: Partial<Beat> & { month: string }) => void }) {
  const [competition, setCompetition] = useState<string>('Premier League')
  const [query, setQuery] = useState('')
  const entry = useMatches(competition)
  const suggestions = useMemo(() => entry?.status === 'ready'
    ? findBeats(seasonStart, competition, entry.matches, LEAGUE_COMPETITIONS.has(competition))
    : [], [entry, seasonStart, competition])
  const have = new Set(existing.map(b => b.text.trim()))
  const shown = suggestions.filter(s => !query || `${s.text} ${s.teams}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <aside className={`${PANEL} h-fit space-y-3 p-4 lg:sticky lg:top-4`}>
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white"><Lightning size={15} weight="fill" className="text-amber-300" /> Beat finder</h3>
        <p className="mt-1 text-xs text-neutral-500">Lead changes, runs, collapses and records, read from the season’s results. Starting points: rewrite them in your own words.</p>
      </div>
      <div className="flex gap-2">
        <select className={`${SELECT} flex-1`} value={competition} onChange={e => setCompetition(e.target.value)} aria-label="Competition">
          {BOOK_COMPETITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <label className="relative block">
        <MagnifyingGlass size={14} className="absolute left-2.5 top-2.5 text-neutral-500" />
        <input className={`${INPUT} pl-8`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by team" />
      </label>
      {(!entry || entry.status === 'loading') && <p className="text-sm text-neutral-500">Reading {competition} {seasonStart}…</p>}
      {entry?.status === 'error' && <p className="text-sm text-amber-300">{entry.error}</p>}
      {entry?.status === 'ready' && !entry.matches.length && <p className="text-sm text-neutral-500">No {competition} matches stored for this season.</p>}
      {entry?.status === 'ready' && entry.matches.length > 0 && (
        <>
          <p className="text-xs text-neutral-500">{entry.matches.length} matches · {suggestions.length} candidates</p>
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {shown.map(s => {
              const added = have.has(s.text)
              return (
                <li key={s.key} className="rounded-lg border border-white/10 bg-neutral-950/60 p-2.5">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider text-neutral-500">
                    <span>{chapterLabel(s.month, true)} · {BEAT_KINDS[s.kind]}</span>
                    <span className="flex">{[1, 2, 3].map(n => <Star key={n} size={10} weight={n <= s.strength ? 'fill' : 'regular'} className={n <= s.strength ? 'text-amber-300' : 'text-neutral-700'} />)}</span>
                  </div>
                  <p className="text-sm text-neutral-200">{s.text}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-neutral-600" title={s.evidence}>{s.evidence}</span>
                    <button type="button" className={`${BUTTON} shrink-0 py-0.5 text-xs`} disabled={added}
                      onClick={() => onAdd({ month: s.month, text: s.text, kind: s.kind, strength: s.strength, teams: s.teams, evidence: `${competition}: ${s.evidence}` })}>
                      {added ? 'Added' : <><Plus size={12} /> Beat</>}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </aside>
  )
}
