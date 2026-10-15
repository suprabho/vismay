'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HISTORY_EVENT_TYPES, type HistoryEvent, type HistoryVerdict } from '@footshorts/shared/historicalEvents'

const API = '/api/footshorts/season-events'
const SELECT = 'rounded-lg border border-white/15 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 disabled:opacity-50'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
type Show = 'todo' | 'all' | HistoryVerdict

const VERDICTS: { value: HistoryVerdict; label: string; key: string; on: string }[] = [
  { value: 'yes', label: 'Yes', key: 'y', on: 'border-emerald-400/70 bg-emerald-500/15 text-emerald-300' },
  { value: 'fixed', label: 'Fixed', key: 'f', on: 'border-amber-400/70 bg-amber-500/15 text-amber-300' },
  { value: 'no', label: 'No', key: 'n', on: 'border-rose-400/70 bg-rose-500/15 text-rose-300' },
]
const STRIPE: Record<string, string> = { yes: 'border-l-emerald-400', fixed: 'border-l-amber-400', no: 'border-l-rose-400', '': 'border-l-transparent' }

function sourceLabel(origin: string) {
  if (origin.startsWith('wikipedia:managerial')) return 'Wikipedia · managerial changes table'
  if (origin.startsWith('wikipedia:transfers')) return 'Wikipedia · transfer list'
  if (origin.startsWith('transfermarkt')) return 'Transfermarkt'
  return origin.split(' + ').map(o => o.startsWith('claude:') ? `Claude, from “${o.slice(7)}”` : o).join(' + ')
}

function dateParts(date: string) {
  const [y, m, d] = date.split('-')
  const mon = MONTHS[Number(m) - 1]?.slice(0, 3) ?? m
  return d ? { big: `${Number(d)} ${mon}`, small: y } : { big: mon, small: `${y} · month only` }
}

export function SeasonEventsClient() {
  const [seasons, setSeasons] = useState<string[]>([])
  // `requested` drives the fetch (null = let the API pick the newest season);
  // `season` is what the API answered with, shown in the picker.
  const [requested, setRequested] = useState<string | null>(null)
  const [season, setSeason] = useState<string | null>(null)
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [show, setShow] = useState<Show>('todo')
  const [type, setType] = useState('')
  const [minImportance, setMinImportance] = useState(1)
  const [current, setCurrent] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(requested ? `${API}?season=${encodeURIComponent(requested)}` : API, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Could not load events')
        if (controller.signal.aborted) return
        setSeasons(data.seasons)
        setSeason(data.season)
        setEvents(data.events)
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [requested])

  const save = useCallback(async (id: string, patch: { verified?: '' | HistoryVerdict; notes?: string }) => {
    const before = events.find(e => e.id === id)
    if (!before) return false
    setEvents(list => list.map(e => e.id === id ? { ...e, ...patch } : e))
    setSaveError('')
    try {
      const response = await fetch(`${API}/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not save')
      setEvents(list => list.map(e => e.id === id ? data.event : e))
      return true
    } catch (e) {
      setEvents(list => list.map(x => x.id === id ? before : x))
      setSaveError(e instanceof Error ? e.message : 'Could not save')
      return false
    }
  }, [events])

  const visible = useMemo(() => events.filter(e =>
    (show === 'all' || (show === 'todo' ? !e.verified : e.verified === show)) &&
    (!type || e.type === type) && e.importance >= minImportance,
  ), [events, show, type, minImportance])

  const byMonth = useMemo(() => {
    const groups = new Map<string, HistoryEvent[]>()
    for (const e of visible) {
      const key = e.date.slice(0, 7)
      groups.set(key, [...(groups.get(key) ?? []), e])
    }
    return [...groups]
  }, [visible])

  const counts = useMemo(() => {
    const c = { yes: 0, fixed: 0, no: 0 }
    for (const e of events) if (e.verified) c[e.verified]++
    return c
  }, [events])
  const checked = counts.yes + counts.fixed + counts.no

  const focusRow = useCallback((id: string) => {
    setCurrent(id)
    const row = rowRefs.current.get(id)
    row?.focus({ preventScroll: true })
    row?.scrollIntoView({ block: 'nearest' })
  }, [])

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const target = ev.target as HTMLElement
      if (target.closest('textarea,input,select') || ev.metaKey || ev.ctrlKey || ev.altKey || !visible.length) return
      const i = visible.findIndex(e => e.id === current)
      if (ev.key === 'j' || ev.key === 'k') {
        ev.preventDefault()
        const next = i < 0 ? 0 : Math.max(0, Math.min(visible.length - 1, i + (ev.key === 'j' ? 1 : -1)))
        focusRow(visible[next].id)
        return
      }
      const verdict = VERDICTS.find(v => v.key === ev.key)
      if (verdict && current) {
        ev.preventDefault()
        const event = visible[i]
        const following = visible[i + 1]?.id
        save(current, { verified: event?.verified === verdict.value ? '' : verdict.value })
          .then(ok => { if (ok && show === 'todo' && following) focusRow(following) })
      } else if (ev.key === 'e' && current) {
        ev.preventDefault()
        document.getElementById(`note-${current}`)?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [visible, current, save, show, focusRow])

  const pct = (n: number) => `${events.length ? (100 * n) / events.length : 0}%`

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 min-h-0 overflow-y-auto px-4 py-8 sm:px-6">
      <div className="sticky top-0 z-10 -mx-4 space-y-3 border-b border-white/10 bg-neutral-950/95 px-4 pb-3 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-amber-300">Private admin data · Football seasons book</div>
            <h1 className="text-2xl font-semibold text-white">Season events</h1>
            <p className="mt-1 max-w-3xl text-sm text-neutral-400">Manager changes, big transfers and the events Claude pulled from Wikipedia, each with the quote it came from. Check each one against its source and mark it Yes, Fixed or No.</p>
          </div>
          <div className="text-right font-mono text-xs tabular-nums text-neutral-400">
            <div><span className="text-neutral-100">{checked}</span> of {events.length} checked</div>
            <div className="mt-1 space-x-3">
              <span><span className="text-emerald-300">{counts.yes}</span> yes</span>
              <span><span className="text-amber-300">{counts.fixed}</span> fixed</span>
              <span><span className="text-rose-300">{counts.no}</span> no</span>
            </div>
          </div>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <span className="bg-emerald-400 transition-all" style={{ width: pct(counts.yes) }} />
          <span className="bg-amber-400 transition-all" style={{ width: pct(counts.fixed) }} />
          <span className="bg-rose-400 transition-all" style={{ width: pct(counts.no) }} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-neutral-400">Season
            <select className={SELECT} value={season ?? ''} disabled={!seasons.length} onChange={e => { setRequested(e.target.value); setCurrent(null) }}>
              {seasons.map(s => <option key={s} value={s}>{s.replace('-', '–')}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-xs text-neutral-400">Show
            <div className="inline-flex overflow-hidden rounded-lg border border-white/15" role="group" aria-label="Show">
              {(['todo', 'all', 'yes', 'fixed', 'no'] as Show[]).map(s => (
                <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)}
                  className={`px-3 py-2 text-sm ${show === s ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-neutral-200'} [&+&]:border-l [&+&]:border-white/15`}>
                  {s === 'todo' ? 'To check' : s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">Type
            <select className={SELECT} value={type} onChange={e => setType(e.target.value)}>
              <option value="">All types</option>
              {Object.entries(HISTORY_EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">Importance
            <select className={SELECT} value={minImportance} onChange={e => setMinImportance(Number(e.target.value))}>
              <option value={1}>Any</option><option value={2}>2 and up</option><option value={3}>3 only</option>
            </select>
          </label>
          <p className="ml-auto hidden font-mono text-[11px] text-neutral-500 lg:block">j / k move · y f n mark · e note</p>
        </div>
        {saveError && <p className="text-sm text-rose-300">{saveError}</p>}
      </div>

      {error && <div className="mt-6 rounded-lg border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      {loading && !error && !events.length && <p className="mt-6 text-sm text-neutral-400">Loading events…</p>}
      {!loading && !error && !events.length && (
        <div className="mt-6 max-w-2xl rounded-lg border border-dashed border-white/15 p-6 text-sm text-neutral-400">
          <h2 className="mb-1 text-base font-medium text-white">No events yet</h2>
          Build a season's events with <code>events.py build</code>, then push them here with <code>pnpm --filter @footshorts/worker history:events-sync -- --season=2003 --push</code>.
        </div>
      )}
      {!loading && !error && !!events.length && !visible.length && (
        <div className="mt-6 max-w-2xl rounded-lg border border-dashed border-white/15 p-6 text-sm text-neutral-400">
          <h2 className="mb-1 text-base font-medium text-white">{show === 'todo' ? 'All checked' : 'Nothing here'}</h2>
          {show === 'todo' ? 'Every event matching these filters has a verdict. Switch to All to revisit them.' : 'No events match these filters.'}
        </div>
      )}

      {byMonth.map(([key, items]) => {
        const [y, m] = key.split('-')
        return (
          <section key={key} className="mt-8">
            <h2 className="mb-2 flex items-baseline gap-3 text-sm font-semibold uppercase tracking-wider text-neutral-200">
              {MONTHS[Number(m) - 1]} {y}
              <span className="font-mono text-xs font-normal normal-case tracking-normal text-neutral-500">{items.length} {items.length === 1 ? 'event' : 'events'}</span>
            </h2>
            <div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/60">
              {items.map(e => {
                const d = dateParts(e.date)
                const meta = [e.team_names, e.people].filter(Boolean).map(s => s.split(' | ').join(', ')).join(' — ')
                return (
                  <article key={e.id} tabIndex={-1} ref={el => { if (el) rowRefs.current.set(e.id, el); else rowRefs.current.delete(e.id) }}
                    onClick={ev => { if (!(ev.target as HTMLElement).closest('a,button,textarea')) focusRow(e.id) }}
                    className={`grid grid-cols-1 gap-3 border-l-4 px-4 py-4 outline-none md:grid-cols-[88px_minmax(0,1fr)_220px] md:gap-5 ${STRIPE[e.verified]} ${current === e.id ? 'bg-white/[0.04] ring-1 ring-inset ring-sky-400/60' : ''}`}>
                    <div className="font-mono text-xs leading-tight tabular-nums text-neutral-500">
                      <span className="text-sm text-neutral-200 md:block">{d.big}</span> {d.small}
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-medium uppercase tracking-wide text-sky-300">{HISTORY_EVENT_TYPES[e.type] ?? e.type}</span>
                        <span className="font-mono text-sky-300" title={`Importance ${e.importance} of 3`}>{'●'.repeat(e.importance)}<span className="text-neutral-600">{'●'.repeat(3 - e.importance)}</span></span>
                        {e.competition && <span className="text-neutral-500">{e.competition}</span>}
                      </div>
                      <p className="font-medium text-neutral-100">{e.summary}</p>
                      {meta && <p className="mt-0.5 text-sm text-neutral-400">{meta}</p>}
                      {e.evidence && <blockquote className="mt-2 rounded-md bg-white/[0.04] px-3 py-2 text-sm italic text-neutral-300">“{e.evidence}”</blockquote>}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 break-all font-mono text-[11px] text-neutral-500">
                        <span>{sourceLabel(e.origin)}</span>
                        {e.source_page && <a className="text-sky-300 hover:underline" href={e.source_page} target="_blank" rel="noopener noreferrer">Wikipedia page ↗</a>}
                        {e.source_url && <a className="text-sky-300 hover:underline" href={e.source_url} target="_blank" rel="noopener noreferrer" title={e.source_url}>Citation ↗</a>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        {VERDICTS.map(v => (
                          <button key={v.value} type="button" aria-pressed={e.verified === v.value}
                            onClick={() => save(e.id, { verified: e.verified === v.value ? '' : v.value })}
                            className={`rounded-md border py-1.5 text-xs font-medium uppercase tracking-wide ${e.verified === v.value ? v.on : 'border-white/15 text-neutral-400 hover:text-neutral-200'}`}>
                            {v.label}
                          </button>
                        ))}
                      </div>
                      <NoteField event={e} onSave={notes => save(e.id, { notes })} />
                      {e.verified && e.checked_at && (
                        <p className="font-mono text-[10px] text-neutral-500">
                          {e.checked_by ?? 'Checked'} · {new Date(e.checked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Saves on blur; keeps local text while typing so a list refresh never eats it. */
function NoteField({ event, onSave }: { event: HistoryEvent; onSave: (notes: string) => Promise<boolean> }) {
  const [text, setText] = useState(event.notes)
  const [state, setState] = useState('')
  const editing = useRef(false)
  useEffect(() => { if (!editing.current) setText(event.notes) }, [event.notes])
  return (
    <>
      <textarea id={`note-${event.id}`} value={text} placeholder="Note: what was wrong, the fix, a better source"
        aria-label="Note for this event" rows={2}
        onFocus={() => { editing.current = true }}
        onChange={e => setText(e.target.value)}
        onBlur={async () => {
          editing.current = false
          if (text === event.notes) return
          setState('Saving…')
          setState((await onSave(text)) ? 'Note saved' : '')
        }}
        className="w-full resize-y rounded-md border border-white/15 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600" />
      {state && <p className="font-mono text-[10px] text-neutral-500">{state}</p>}
    </>
  )
}
