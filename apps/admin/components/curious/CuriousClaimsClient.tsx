'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReviewClaim, ReviewCounts } from '@vismay/curious-pipeline/store'
import { GRADE_LABELS } from '@vismay/curious-pipeline/grade'
import { ERAS, REGION_IDS, THEME_IDS, THEME_NAMES } from '@vismay/curious-pipeline/taxonomy'
import { MagnifyingGlass, Shuffle, Sparkle, SpinnerGap } from '@phosphor-icons/react'

const API = '/api/vizmaya/curious/claims'
const GENERATE_API = '/api/vizmaya/curious/generate'
const VERDICT_TONE: Record<string, string> = { supported: 'text-emerald-300', partly: 'text-amber-300', contradicted: 'text-rose-300', unsupported: 'text-rose-300' }

interface GenerateResult {
  written: Array<{ id: string; text: string; grade: string }>
  dropped: Array<{ text: string; reason: string }>
  queries: string[]
  results: number
  proposed: number
  errors: string[]
}

/** The on-demand LLM run: a brief in, checked claims into the queue. */
function GeneratePanel({ onDone }: { onDone: () => void }) {
  const [era, setEra] = useState('')
  const [theme, setTheme] = useState('')
  const [region, setRegion] = useState('')
  const [hint, setHint] = useState('')
  const [count, setCount] = useState(5)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [running])

  /** Draw a random era, theme and region for the brief (the angle is left as typed). */
  function shuffle() {
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]
    setEra(pick(ERAS).id)
    setTheme(pick(THEME_IDS))
    setRegion(pick(REGION_IDS.filter((r) => r !== 'world')))
  }

  async function run() {
    setRunning(true)
    setElapsed(0)
    setError('')
    setResult(null)
    try {
      const response = await fetch(GENERATE_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ era, theme, region, hint, count }) })
      const data = await response.json().catch(() => ({ error: `The run failed (${response.status})` }))
      if (!response.ok) throw new Error(data.error ?? 'The run failed')
      setResult(data)
      if (data.written?.length) onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The run failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="w-full rounded-xl border border-violet-400/30 bg-violet-500/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-violet-200">
          <Sparkle size={16} weight="fill" /> Generate claims with an LLM
        </div>
        <button type="button" onClick={shuffle} disabled={running} title="Random era, theme and region" className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400/40 px-2 py-1 text-xs font-medium text-violet-200 hover:border-violet-300 hover:bg-violet-500/10 disabled:opacity-50">
          <Shuffle size={14} /> Shuffle
        </button>
      </div>
      <p className="mb-3 text-xs text-neutral-400">
        A model searches the web for the brief and proposes claims citing the pages it found. Each page is read, and a second model checks every claim against them, grades it and picks a quote that must appear word for word. What survives lands here as in review. A run of five takes one to three minutes.
      </p>
      <div className="grid gap-2">
        <select className={SELECT} value={era} onChange={(e) => setEra(e.target.value)} disabled={running} aria-label="Era">
          <option value="">Any era</option>
          {ERAS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select className={SELECT} value={theme} onChange={(e) => setTheme(e.target.value)} disabled={running} aria-label="Theme">
          <option value="">Any theme</option>
          {THEME_IDS.map((t) => (
            <option key={t} value={t}>
              {THEME_NAMES[t]}
            </option>
          ))}
        </select>
        <select className={SELECT} value={region} onChange={(e) => setRegion(e.target.value)} disabled={running} aria-label="Region">
          <option value="">Any region</option>
          {REGION_IDS.filter((r) => r !== 'world').map((r) => (
            <option key={r} value={r}>
              {r.replace(/-/g, ' ')}
            </option>
          ))}
        </select>
        <input className={SELECT} placeholder="Angle (optional): a person, a place, a subject" value={hint} maxLength={300} onChange={(e) => setHint(e.target.value)} disabled={running} aria-label="Angle" />
        <div className="flex gap-2">
          <select className={`${SELECT} flex-1`} value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={running} aria-label="How many">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} claim{n === 1 ? '' : 's'}
              </option>
            ))}
          </select>
          <button type="button" onClick={run} disabled={running} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-violet-400/70 bg-violet-500/20 px-3 py-2 text-sm font-medium text-violet-100 hover:bg-violet-500/30 disabled:opacity-60">
            {running ? <SpinnerGap size={16} className="animate-spin" /> : <MagnifyingGlass size={16} />}
            {running ? `Researching… ${elapsed}s` : 'Run'}
          </button>
        </div>
      </div>
      {error && <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
      {result && (
        <div className="mt-3 space-y-2 text-xs text-neutral-300">
          <div className="font-mono tabular-nums text-neutral-400">
            {result.queries.length} searches · {result.results} pages found · {result.proposed} proposed · <span className="text-emerald-300">{result.written.length} queued</span> · {result.dropped.length} dropped
          </div>
          {result.written.length > 0 && (
            <ul className="space-y-1">
              {result.written.map((w) => (
                <li key={w.id}>
                  <span className={`mr-2 inline-block w-5 rounded border text-center ${GRADE_TONE[w.grade] ?? ''}`}>{w.grade}</span>
                  {w.text}
                </li>
              ))}
            </ul>
          )}
          {result.dropped.length > 0 && (
            <details>
              <summary className="cursor-pointer text-neutral-400">Dropped, and why</summary>
              <ul className="mt-1 space-y-1 pl-4 text-neutral-500">
                {result.dropped.map((d, i) => (
                  <li key={i}>
                    {d.text} — <span className="text-neutral-400">{d.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {result.errors.length > 0 && <div className="text-rose-300">{result.errors.join(' · ')}</div>}
        </div>
      )}
    </div>
  )
}
const SELECT = 'rounded-lg border border-white/15 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 disabled:opacity-50'
type Show = 'in_review' | 'todo' | 'graded' | 'candidate' | 'approved' | 'sent_back' | 'rejected' | 'all'
type Action = 'approve' | 'send_back' | 'reject'

const ACTIONS: { value: Action; label: string; key: string; on: string }[] = [
  { value: 'approve', label: 'Approve', key: 'a', on: 'border-emerald-400/70 bg-emerald-500/15 text-emerald-300' },
  { value: 'send_back', label: 'Send back', key: 's', on: 'border-amber-400/70 bg-amber-500/15 text-amber-300' },
  { value: 'reject', label: 'Reject', key: 'r', on: 'border-rose-400/70 bg-rose-500/15 text-rose-300' },
]
const STATUS_STRIPE: Record<string, string> = { approved: 'border-l-emerald-400', sent_back: 'border-l-amber-400', rejected: 'border-l-rose-400', in_review: 'border-l-sky-400', graded: 'border-l-neutral-500', candidate: 'border-l-neutral-700' }
const GRADE_TONE: Record<string, string> = { A: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50', B: 'bg-teal-500/20 text-teal-200 border-teal-400/50', C: 'bg-amber-500/20 text-amber-200 border-amber-400/50', D: 'bg-orange-500/20 text-orange-200 border-orange-400/50', E: 'bg-rose-500/20 text-rose-200 border-rose-400/50' }
const FEATURES: Array<{ key: string; label: string; weight: number }> = [
  { key: 'primary', label: 'Primary source', weight: 0.3 },
  { key: 'independentContemporaneous', label: 'Independent, contemporaneous', weight: 0.2 },
  { key: 'institutional', label: 'Institutional quality', weight: 0.15 },
  { key: 'quotation', label: 'Quotation found', weight: 0.1 },
  { key: 'chronPlausible', label: 'Chronology holds', weight: 0.1 },
  { key: 'geoConsistent', label: 'Geography holds', weight: 0.05 },
  { key: 'textConfidence', label: 'Text confidence', weight: 0.05 },
  { key: 'secondaryScholarship', label: 'Scholarship cited', weight: 0.05 },
]
const PENALTIES: Array<{ key: string; label: string; weight: number }> = [
  { key: 'anonymousRepetition', label: 'Anonymous repetition', weight: 0.1 },
  { key: 'circular', label: 'Circular citation', weight: 0.15 },
  { key: 'timeGap', label: 'Time gap', weight: 0.1 },
  { key: 'translation', label: 'Crossed a language', weight: 0.05 },
  { key: 'contradiction', label: 'Contradicted', weight: 0.25 },
]

const when = (iso: string | null | undefined, precision?: string | null) => {
  if (!iso) return 'undated'
  const d = new Date(iso)
  if (precision === 'year') return String(d.getUTCFullYear())
  if (precision === 'month') return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', timeZone: 'UTC' })
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
const host = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    return url ?? ''
  }
}

export function CuriousClaimsClient() {
  const [claims, setClaims] = useState<ReviewClaim[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<ReviewCounts>({ byStatus: {}, byGrade: {} })
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [show, setShow] = useState<Show>('in_review')
  const [grade, setGrade] = useState('')
  const [theme, setTheme] = useState('')
  const [source, setSource] = useState('')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [reload, setReload] = useState(0)
  const [current, setCurrent] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [edits, setEdits] = useState<Record<string, string>>({})
  const firstLoad = useRef(true)
  const rowRefs = useRef(new Map<string, HTMLElement>())

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const params = useMemo(() => {
    const p = new URLSearchParams({ status: show, limit: '100', r: String(reload) })
    if (grade) p.set('grade', grade)
    if (theme) p.set('theme', theme)
    if (source) p.set('source', source)
    if (query) p.set('q', query)
    return p.toString()
  }, [show, grade, theme, source, query, reload])
  const loading = loadedKey !== params

  useEffect(() => {
    const controller = new AbortController()
    let url = `${API}?${params}`
    // A ?claim=<uuid> link opens that one claim on the first load only.
    if (firstLoad.current) {
      firstLoad.current = false
      const initial = new URLSearchParams(window.location.search).get('claim')
      if (initial) url += `&id=${encodeURIComponent(initial)}`
    }
    fetch(url, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Could not load claims')
        if (controller.signal.aborted) return
        setClaims(data.claims)
        setTotal(data.total)
        setCounts(data.counts)
        setNotes((n) => Object.fromEntries((data.claims as ReviewClaim[]).map((c) => [c.id, n[c.id] ?? c.review_note ?? ''])))
        setError('')
        setLoadedKey(params)
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setError(e.message)
        setLoadedKey(params)
      })
    return () => controller.abort()
  }, [params])

  const act = useCallback(
    async (id: string, action: Action) => {
      const before = claims.find((c) => c.id === id)
      if (!before) return false
      const note = notes[id]?.trim() || null
      if (action === 'send_back' && !note) {
        setSaveError('Send back needs a note saying what to fix.')
        document.getElementById(`note-${id}`)?.focus()
        return false
      }
      const text = edits[id] !== undefined && edits[id].trim() !== before.text ? edits[id].trim() : null
      const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'sent_back'
      setClaims((list) => list.map((c) => (c.id === id ? { ...c, status, review_note: note, text: text ?? c.text } : c)))
      setSaveError('')
      try {
        const response = await fetch(`${API}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note, text }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Could not save')
        setClaims((list) => list.map((c) => (c.id === id ? data.claim ?? c : c)))
        return true
      } catch (e) {
        setClaims((list) => list.map((c) => (c.id === id ? before : c)))
        setSaveError(e instanceof Error ? e.message : 'Could not save')
        return false
      }
    },
    [claims, notes, edits],
  )

  const visible = claims
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
      const i = visible.findIndex((c) => c.id === current)
      if (ev.key === 'j' || ev.key === 'k') {
        ev.preventDefault()
        const next = i < 0 ? 0 : Math.max(0, Math.min(visible.length - 1, i + (ev.key === 'j' ? 1 : -1)))
        focusRow(visible[next].id)
        return
      }
      if (!current) return
      const action = ACTIONS.find((a) => a.key === ev.key)
      if (action) {
        ev.preventDefault()
        const following = visible[i + 1]?.id
        act(current, action.value).then((ok) => {
          if (ok && (show === 'in_review' || show === 'todo') && following) focusRow(following)
        })
      } else if (ev.key === 'e') {
        ev.preventDefault()
        document.getElementById(`note-${current}`)?.focus()
      } else if (ev.key === 'o') {
        const c = visible[i]
        if (c?.document?.canonical_url) window.open(c.document.canonical_url, '_blank', 'noopener')
      } else if (ev.key === 'g') {
        ev.preventDefault()
        setOpen((o) => ({ ...o, [current]: !o[current] }))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [visible, current, act, show, focusRow])

  const queued = (counts.byStatus.in_review ?? 0) + (counts.byStatus.graded ?? 0)
  const gradeOrder = useMemo(() => ['A', 'B', 'C', 'D', 'E'].map((g) => [g, counts.byGrade[g] ?? 0] as const), [counts])

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-1 min-h-0 flex-col overflow-y-auto px-4 pt-8 sm:px-6 lg:overflow-hidden">
      <div className="shrink-0 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-amber-300">Private admin data · Curious Desk</div>
            <h1 className="text-2xl font-semibold text-white">Curious claims</h1>
            <p className="mt-1 max-w-3xl text-sm text-neutral-400">
              Candidate facts and anecdotes, generated with an LLM and web search (or from the old collectors), each with the quote it came from, its sources grouped by lineage and the features behind its grade. Approve what the desk may draw; send back what needs re-extracting with a note; reject what is wrong. Five articles from one wire story are one lineage.
            </p>
          </div>
          <div className="text-right font-mono text-xs tabular-nums text-neutral-400">
            <div>
              <span className="text-neutral-100">{queued}</span> queued · <span className="text-emerald-300">{counts.byStatus.approved ?? 0}</span> approved · <span className="text-rose-300">{counts.byStatus.rejected ?? 0}</span> rejected
            </div>
            <div className="mt-1 space-x-2">
              {gradeOrder.map(([g, n]) => (
                <span key={g}>
                  <span className={GRADE_TONE[g].split(' ')[1]}>{g}</span> {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="gap-6 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="mb-6 lg:mb-0 lg:min-h-0 lg:overflow-y-auto lg:pb-8">
          <GeneratePanel
            onDone={() => {
              setShow('in_review')
              setReload((n) => n + 1)
            }}
          />
        </aside>

        <section className="lg:min-h-0 lg:overflow-y-auto lg:pb-8">
          <div className="sticky top-0 z-10 space-y-3 border-b border-white/10 bg-neutral-950/95 pb-3 pt-1 backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              <select className={SELECT} value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Status">
                <option value="in_review">In review</option>
                <option value="todo">In review + graded</option>
                <option value="graded">Graded</option>
                <option value="candidate">Candidates (ungraded)</option>
                <option value="approved">Approved</option>
                <option value="sent_back">Sent back</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
              <select className={SELECT} value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade">
                <option value="">Any grade</option>
                {['A', 'B', 'C', 'D', 'E'].map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
              <select className={SELECT} value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Theme">
                <option value="">Any theme</option>
                {THEME_IDS.map((t) => (
                  <option key={t} value={t}>
                    {THEME_NAMES[t]}
                  </option>
                ))}
              </select>
              <select className={SELECT} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
                <option value="">Any source</option>
                <option value="gdelt">GDELT news</option>
                <option value="loc">Library of Congress</option>
                <option value="europeana">Europeana</option>
                <option value="gallica">Gallica</option>
                <option value="web-search">Web search (LLM)</option>
              </select>
              <input className={`${SELECT} w-64`} placeholder="Search the claim text" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
              <span className="ml-auto text-xs text-neutral-500">
                {loading ? 'Loading…' : `${visible.length} of ${total}`} · keys: j/k move · a approve · s send back · r reject · e note · o open source · g features
              </span>
            </div>
            {(error || saveError) && <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error || saveError}</div>}
          </div>

          <ol className="mt-4 space-y-3">
            {!loading && !visible.length && <li className="rounded-xl border border-white/10 bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-400">Nothing here. Use <span className="text-violet-200">Generate claims with an LLM</span> on the left to research a batch, or run <code className="text-neutral-200">pnpm curious:generate</code> in apps/vizmaya-fyi.</li>}
            {visible.map((c) => {
              const f = (c.score_features ?? {}) as Record<string, unknown>
              const isCurrent = current === c.id
              const lineageGroups = new Map<string, typeof c.sources>()
              for (const s of c.sources) {
                const list = lineageGroups.get(s.independence_group) ?? []
                list.push(s)
                lineageGroups.set(s.independence_group, list)
              }
              return (
                <li
                  key={c.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(c.id, el)
                    else rowRefs.current.delete(c.id)
                  }}
                  tabIndex={0}
                  onFocus={() => setCurrent(c.id)}
                  onClick={() => setCurrent(c.id)}
                  className={`rounded-xl border border-l-4 bg-neutral-900/60 p-4 outline-none transition ${STATUS_STRIPE[c.status] ?? 'border-l-transparent'} ${isCurrent ? 'border-white/40 ring-1 ring-white/20' : 'border-white/10'}`}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-base font-semibold ${GRADE_TONE[c.grade ?? ''] ?? 'border-white/15 text-neutral-400'}`} title={c.grade ? GRADE_LABELS[c.grade] : 'ungraded'}>
                      {c.grade ?? '·'}
                    </span>
                    <div className="min-w-0 flex-1">
                      {edits[c.id] !== undefined ? (
                        <textarea className="w-full rounded-lg border border-white/15 bg-neutral-950 px-3 py-2 text-base text-neutral-100" rows={2} value={edits[c.id]} onChange={(e) => setEdits((x) => ({ ...x, [c.id]: e.target.value }))} maxLength={500} />
                      ) : (
                        <p className="text-base text-neutral-100">{c.text}</p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-400">
                        <span className="uppercase tracking-wider">{c.kind}</span>
                        {c.theme && <span>{THEME_NAMES[c.theme as keyof typeof THEME_NAMES] ?? c.theme}</span>}
                        {c.era && <span>{c.era}</span>}
                        {c.year_from != null && <span>{c.year_from}{c.year_to && c.year_to !== c.year_from ? `–${c.year_to}` : ''}</span>}
                        {c.place && <span>{c.place}</span>}
                        {c.score != null && <span className="font-mono tabular-nums">score {Number(c.score).toFixed(2)}</span>}
                        <span className="font-mono tabular-nums">{c.sources.length} source{c.sources.length === 1 ? '' : 's'} · {c.lineages} lineage{c.lineages === 1 ? '' : 's'}</span>
                        {c.flags.map((fl) => (
                          <span key={fl} className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-amber-200">{fl}</span>
                        ))}
                        <span className="text-neutral-500">{c.status.replace('_', ' ')}{c.reviewed_by ? ` · ${c.reviewed_by}` : ''}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {ACTIONS.map((a) => (
                        <button
                          key={a.value}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            act(c.id, a.value)
                          }}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${(c.status === 'approved' && a.value === 'approve') || (c.status === 'rejected' && a.value === 'reject') || (c.status === 'sent_back' && a.value === 'send_back') ? a.on : 'border-white/15 text-neutral-300 hover:border-white/40'}`}
                        >
                          {a.label} <span className="ml-1 font-mono text-[10px] text-neutral-500">{a.key}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <blockquote className="mt-3 border-l-2 border-white/15 pl-3 text-sm text-neutral-300">
                    “{c.evidence_quote}”
                    <footer className="mt-1 text-xs text-neutral-500">
                      {c.document ? (
                        <>
                          <a className="text-sky-300 hover:underline" href={c.document.canonical_url} target="_blank" rel="noopener noreferrer">
                            {c.document.title ?? host(c.document.canonical_url)}
                          </a>
                          {' · '}
                          {c.document.publisher ?? host(c.document.canonical_url)} · {when(c.document.published_at, c.document.published_precision)} · {c.document.source_id}
                          {c.document.archive_url && (
                            <>
                              {' · '}
                              <a className="text-sky-300 hover:underline" href={c.document.archive_url} target="_blank" rel="noopener noreferrer">
                                archive
                              </a>
                            </>
                          )}
                          {c.evidence_page != null && ` · p.${c.evidence_page}`}
                        </>
                      ) : (
                        'document missing'
                      )}
                      {c.speaker && ` · attributed to ${c.speaker}`}
                      {c.is_hearsay && ' · hearsay'}
                      {c.is_anonymous && ' · no named source'}
                    </footer>
                  </blockquote>

                  {lineageGroups.size > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {[...lineageGroups.entries()].map(([group, list]) => (
                        <div key={group} className="rounded-lg border border-white/10 bg-neutral-950/60 p-2 text-xs">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="font-mono text-neutral-400">{group}</span>
                            <span className="text-neutral-500">{list.length} source{list.length === 1 ? '' : 's'}</span>
                          </div>
                          <ul className="space-y-1">
                            {list.map((s) => (
                              <li key={s.id} className="text-neutral-300">
                                <span className={`mr-1 rounded px-1 ${s.relation === 'contradicts' ? 'bg-rose-500/20 text-rose-200' : s.relation === 'derived_from' ? 'bg-white/5 text-neutral-400' : 'bg-white/10'}`}>{s.relation.replace('_', ' ')}</span>
                                {s.is_primary && <span className="mr-1 rounded bg-emerald-500/20 px-1 text-emerald-200">primary</span>}
                                {s.document_url ? (
                                  <a className="text-sky-300 hover:underline" href={s.document_url} target="_blank" rel="noopener noreferrer">
                                    {s.document_title ?? host(s.document_url)}
                                  </a>
                                ) : (
                                  <span>{s.external_ref ?? 'external'}</span>
                                )}
                                {s.document_published_at && <span className="text-neutral-500"> · {when(s.document_published_at)}</span>}
                                {s.source_year && <span className="text-neutral-500"> · {s.source_year}</span>}
                                {s.work_type && <span className="text-neutral-500"> · {s.work_type}</span>}
                                <span className="text-neutral-600"> · {s.verified_by}</span>
                                {s.quote && <div className="text-neutral-500">“{s.quote.length > 140 ? `${s.quote.slice(0, 140)}…` : s.quote}”</div>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {c.entities.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      {c.entities.map((e) => (
                        <span key={e.id} className={`rounded-full border px-2 py-0.5 ${e.is_living_private ? 'border-amber-400/50 text-amber-200' : 'border-white/15 text-neutral-300'}`} title={e.is_living_private ? 'possibly a private person' : e.kind}>
                          {e.name}
                          {e.wikidata_qid && <span className="ml-1 text-neutral-500">{e.wikidata_qid}</span>}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-start gap-3">
                    <button type="button" className="text-xs text-neutral-400 hover:text-neutral-200" onClick={(e) => { e.stopPropagation(); setOpen((o) => ({ ...o, [c.id]: !o[c.id] })) }}>
                      {open[c.id] ? 'Hide' : 'Show'} {f.method === 'llm-check' ? 'the check' : 'the grade’s features'}
                    </button>
                    <button type="button" className="text-xs text-neutral-400 hover:text-neutral-200" onClick={(e) => { e.stopPropagation(); setEdits((x) => (x[c.id] === undefined ? { ...x, [c.id]: c.text } : Object.fromEntries(Object.entries(x).filter(([k]) => k !== c.id)))) }}>
                      {edits[c.id] === undefined ? 'Fix the wording' : 'Cancel the edit'}
                    </button>
                  </div>
                  {open[c.id] && f.method === 'llm-check' && (
                    <div className="mt-2 space-y-1.5 rounded-lg border border-violet-400/20 bg-neutral-950/60 p-3 text-xs text-neutral-300">
                      <div>
                        <span className="text-neutral-500">LLM check: </span>
                        <span className={VERDICT_TONE[String(f.verdict)] ?? ''}>{String(f.verdict)}</span>
                        <span className="text-neutral-500"> · {String(f.lineages ?? 0)} lineage{Number(f.lineages) === 1 ? '' : 's'}{f.primary ? ' · primary source found' : ''}</span>
                      </div>
                      {typeof f.core === 'string' && <div><span className="text-neutral-500">Supported core: </span>{f.core}</div>}
                      {typeof f.embellishment === 'string' && <div><span className="text-neutral-500">Not supported: </span><span className="text-amber-200">{f.embellishment}</span></div>}
                      {typeof f.why_curious === 'string' && <div><span className="text-neutral-500">Why it is curious: </span>{f.why_curious}</div>}
                      {Array.isArray(f.notes) && f.notes.length > 0 && (
                        <ul className="list-disc pl-4 text-neutral-400">
                          {(f.notes as string[]).slice(1).map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {open[c.id] && f.method !== 'llm-check' && (
                    <div className="mt-2 grid gap-x-6 gap-y-1 rounded-lg border border-white/10 bg-neutral-950/60 p-3 text-xs sm:grid-cols-2">
                      {FEATURES.map((ft) => {
                        const v = typeof f[ft.key] === 'number' ? (f[ft.key] as number) : 0
                        return (
                          <div key={ft.key} className="flex items-center gap-2">
                            <span className="w-44 text-neutral-400">{ft.label}</span>
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full bg-emerald-400/70" style={{ width: `${Math.round(v * 100)}%` }} /></span>
                            <span className="w-14 text-right font-mono tabular-nums text-neutral-300">+{(v * ft.weight).toFixed(2)}</span>
                          </div>
                        )
                      })}
                      {PENALTIES.map((ft) => {
                        const v = typeof f[ft.key] === 'number' ? (f[ft.key] as number) : 0
                        return (
                          <div key={ft.key} className="flex items-center gap-2">
                            <span className="w-44 text-neutral-400">{ft.label}</span>
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full bg-rose-400/70" style={{ width: `${Math.round(v * 100)}%` }} /></span>
                            <span className="w-14 text-right font-mono tabular-nums text-neutral-300">{v ? `−${(v * ft.weight).toFixed(2)}` : '0'}</span>
                          </div>
                        )
                      })}
                      {Array.isArray(f.notes) && f.notes.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-neutral-400 sm:col-span-2">
                          {(f.notes as string[]).map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <textarea
                    id={`note-${c.id}`}
                    className="mt-3 w-full rounded-lg border border-white/15 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
                    rows={2}
                    placeholder="Note for the record: what you checked, what to fix (required to send back)."
                    value={notes[c.id] ?? ''}
                    maxLength={4000}
                    onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                    onClick={(e) => e.stopPropagation()}
                  />
                </li>
              )
            })}
          </ol>
        </section>
      </div>
    </div>
  )
}
