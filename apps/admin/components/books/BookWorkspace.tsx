'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowsClockwise, CheckCircle, CircleNotch, Lock, ShieldStar, Trash, WarningCircle } from '@phosphor-icons/react'
import { seasonLabel, seasonSlug, sortSpreads, type Plan, type SeasonBook } from '@/lib/seasonBooks/plan'
import { BOOK_FORMATS, convertToSeasonSpreads, isPlanV2, type AnyPlan, type PlanV2 } from '@/lib/seasonBooks/seasonSpreads'
import { ClaimSpreadsPlanner } from './ClaimSpreadsPlanner'
import { MatchDataProvider } from './MatchData'
import { SeasonSpreadsPlanner } from './season/SeasonSpreadsPlanner'
import { BUTTON, ICON_BUTTON } from './shared'

type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'

const SAVE_DELAY_MS = 1200

/** What every view gets: the plan, and the one way to change it. */
export interface BookViewProps {
  plan: Plan
  seasonStart: number
  title: string
  edit: (fn: (plan: Plan) => Plan) => void
  openSpread: (id: string) => void
}

/** The same for a season-spreads book (plan v2). */
export interface SeasonBookViewProps {
  plan: PlanV2
  seasonStart: number
  title: string
  edit: (fn: (plan: PlanV2) => PlanV2) => void
  /** Open a spread in the Editor by its key, on a tab (and at a field) if given. */
  openSpread: (key: string, tab?: string, field?: string) => void
}

/** The planner's address: the view and the spread it is on, as `?view=&spread=&tab=`. */
export interface PlannerLocation {
  view: string | null
  spread: string | null
  tab: string | null
}

/**
 * Load, autosave and the header for one book, then the planner for its format:
 * claim spreads (plan v1: Beats → Flatplan → Cards → Chapters) or season
 * spreads (plan v2: Roster → Spreads → Editor → Flatplan). Converting a v1
 * book is a one-way action here; the planner for v2 never sees a v1 plan.
 */
export function BookWorkspace({ slug, initial }: { slug: string; initial: PlannerLocation }) {
  const router = useRouter()
  const [book, setBook] = useState<SeasonBook | null>(null)
  const [plan, setPlan] = useState<AnyPlan | null>(null)
  const [title, setTitle] = useState('')
  const [loadError, setLoadError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveError, setSaveError] = useState('')
  const [tick, setTick] = useState(0)

  const planRef = useRef<AnyPlan | null>(null)
  const titleRef = useRef('')
  const revision = useRef(0)
  const version = useRef(0)
  const saving = useRef(false)
  const blocked = useRef(false)

  useEffect(() => {
    fetch(`/api/footshorts/books/${slug}`, { cache: 'no-store' })
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(r.status === 404 ? `No book for ${slug} yet. Start it from the Books list.` : data.error ?? 'Could not load the book')
        const b = data.book as SeasonBook
        setBook(b)
        const p: AnyPlan = isPlanV2(b.plan) ? b.plan : { ...b.plan, spreads: sortSpreads(b.seasonStart, b.plan.spreads) }
        setPlan(p)
        planRef.current = p
        setTitle(b.title)
        titleRef.current = b.title
        revision.current = b.revision
      })
      .catch(e => setLoadError(e.message))
  }, [slug])

  const seasonStart = book?.seasonStart ?? 0

  const markDirty = useCallback(() => {
    if (blocked.current) return
    version.current++
    setSaveState('dirty')
    setTick(t => t + 1)
  }, [])

  /** Change the plan whatever its version; each planner narrows it. */
  const editAny = useCallback((fn: (p: AnyPlan) => AnyPlan) => {
    if (!planRef.current) return
    const next = fn(planRef.current)
    const clean: AnyPlan = isPlanV2(next) ? next : { ...next, spreads: sortSpreads(seasonStart, next.spreads) }
    planRef.current = clean
    setPlan(clean)
    markDirty()
  }, [seasonStart, markDirty])

  const editV1 = useCallback((fn: (p: Plan) => Plan) => editAny(p => isPlanV2(p) ? p : fn(p)), [editAny])
  const editV2 = useCallback((fn: (p: PlanV2) => PlanV2) => editAny(p => isPlanV2(p) ? fn(p) : p), [editAny])

  const editTitle = useCallback((t: string) => {
    titleRef.current = t
    setTitle(t)
    markDirty()
  }, [markDirty])

  const flush = useCallback(async () => {
    if (saving.current || blocked.current || !planRef.current) return
    if (!titleRef.current.trim()) { setSaveState('error'); setSaveError('The book needs a title.'); return }
    saving.current = true
    const v = version.current
    setSaveState('saving')
    try {
      const r = await fetch(`/api/footshorts/books/${slug}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision: revision.current, title: titleRef.current, plan: planRef.current }),
      })
      const data = await r.json()
      if (r.status === 409) {
        blocked.current = true
        setSaveState('conflict')
        setSaveError(data.error)
        return
      }
      if (!r.ok) throw new Error(data.error ?? 'Save failed')
      revision.current = data.book.revision
      setBook(b => b ? { ...b, revision: data.book.revision, updatedAt: data.book.updatedAt, updatedBy: data.book.updatedBy, format: data.book.format } : b)
      setSaveError('')
      if (version.current > v) { setSaveState('dirty'); setTick(t => t + 1) } else setSaveState('saved')
    } catch (e) {
      setSaveState('error')
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      saving.current = false
    }
  }, [slug])

  useEffect(() => {
    if (saveState !== 'dirty') return
    const timer = setTimeout(flush, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [tick, saveState, flush])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (saveState !== 'saved') e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveState])

  async function remove() {
    if (!book || !window.confirm(`Delete the ${seasonLabel(book.seasonStart)} book, its beats and every spread? This can’t be undone.`)) return
    const r = await fetch(`/api/footshorts/books/${slug}`, { method: 'DELETE' })
    if (r.ok) router.push('/footshorts/books')
    else setSaveError((await r.json().catch(() => ({}))).error ?? 'Delete failed')
  }

  /** One way: claim spreads → season spreads. The month spreads are kept as a read-only Legacy view. */
  function convert() {
    if (!plan || isPlanV2(plan)) return
    const months = plan.spreads.filter(s => /^\d{4}-\d{2}$/.test(s.chapter)).length
    const ok = window.confirm(
      `Convert this book to season spreads? Cover and intro stay as frame spreads, the ${plan.beats.length} beats keep their text, and the ${months} month spread${months === 1 ? '' : 's'} move to a read-only Legacy view. This can’t be undone.`,
    )
    if (!ok) return
    editAny(p => isPlanV2(p) ? p : convertToSeasonSpreads(p, seasonStart))
    const params = new URLSearchParams(window.location.search)
    params.set('view', 'roster')
    params.delete('spread')
    params.delete('tab')
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <Link href="/footshorts/books" className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white"><ArrowLeft size={14} /> Books</Link>
        <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">{loadError}</p>
      </div>
    )
  }
  if (!book || !plan) return <p className="px-6 py-10 text-sm text-neutral-500">Loading book…</p>

  const v2 = isPlanV2(plan)
  const header = (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/footshorts/books" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white"><ArrowLeft size={14} /> Books</Link>
        <span className="text-2xl font-extrabold tabular-nums text-white">{seasonLabel(book.seasonStart)}</span>
        <input value={title} onChange={e => editTitle(e.target.value)} aria-label="Book title" maxLength={200}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-lg text-neutral-200 hover:border-white/10 focus:border-white/30 focus:outline-none" />
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wider text-neutral-400" title={v2 ? 'Plan v2: league, team and competition spreads' : 'Plan v1: one claim per spread'}>
          {BOOK_FORMATS[v2 ? 'season-spreads' : 'claim-spreads']}
        </span>
        {!v2 && (
          <button type="button" className={BUTTON} onClick={convert} title="One way: league, team and competition spreads built from data">
            <ArrowsClockwise size={16} /> Convert to season spreads
          </button>
        )}
        <Link href={`/footshorts/books/crests?season=${seasonSlug(book.seasonStart)}`} className={BUTTON} title="This season’s club crests">
          <ShieldStar size={16} /> Crests
        </Link>
        <SaveBadge state={saveState} error={saveError} updatedBy={book.updatedBy} onRetry={() => { setSaveState('dirty'); setTick(t => t + 1) }} />
        <button type="button" className={ICON_BUTTON} title="Delete book" onClick={remove}><Trash size={16} /></button>
      </div>
      {saveState === 'conflict' && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
          <span>{saveError} Your unsaved edits on this page will be lost.</span>
          <button type="button" className={BUTTON} onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
    </>
  )

  return (
    <MatchDataProvider seasonStart={book.seasonStart}>
      {v2
        ? <SeasonSpreadsPlanner plan={plan} seasonStart={book.seasonStart} title={title} edit={editV2} initial={initial} header={header} />
        : <ClaimSpreadsPlanner plan={plan} seasonStart={book.seasonStart} title={title} edit={editV1} initial={initial} header={header} />}
    </MatchDataProvider>
  )
}

function SaveBadge({ state, error, updatedBy, onRetry }: { state: SaveState; error: string; updatedBy: string | null; onRetry: () => void }) {
  if (state === 'saving') return <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400"><CircleNotch size={14} className="animate-spin" /> Saving…</span>
  if (state === 'dirty') return <span className="text-xs text-neutral-500">Unsaved changes</span>
  if (state === 'error') return (
    <span className="inline-flex items-center gap-1.5 text-xs text-red-300" title={error}>
      <WarningCircle size={14} weight="fill" /> {error.length > 60 ? `${error.slice(0, 60)}…` : error}
      <button type="button" className="underline" onClick={onRetry}>Retry</button>
    </span>
  )
  if (state === 'conflict') return <span className="inline-flex items-center gap-1.5 text-xs text-amber-300"><WarningCircle size={14} weight="fill" /> Not saved</span>
  return <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500" title={updatedBy ? `Last saved by ${updatedBy}` : undefined}><CheckCircle size={14} className="text-emerald-400" /> Saved</span>
}

/** Shared by both planners: the tab strip under the header. */
export function PlannerTabs<T extends string>({ tabs, view, onSelect }: {
  tabs: { id: T; label: string; meta: string; warn?: number; locked?: boolean }[]
  view: T
  onSelect: (id: T) => void
}) {
  return (
    <nav className="mt-3 flex gap-1 overflow-x-auto" aria-label="Book views">
      {tabs.map(t => (
        <button key={t.id} type="button" onClick={() => onSelect(t.id)}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm ${view === t.id ? 'border-white text-white' : 'border-transparent text-neutral-400 hover:text-neutral-200'}`}>
          {t.locked && <Lock size={13} />}
          {t.label}
          <span className="text-xs tabular-nums text-neutral-500">{t.meta}</span>
          {!!t.warn && <span className="rounded-full bg-amber-400/15 px-1.5 text-[11px] tabular-nums text-amber-300">{t.warn}</span>}
        </button>
      ))}
    </nav>
  )
}
