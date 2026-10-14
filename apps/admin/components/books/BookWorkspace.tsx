'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle, CircleNotch, Lock, Trash, WarningCircle } from '@phosphor-icons/react'
import {
  BEAT_TARGET, beatIssues, type BookView, cardIssues, pacingIssues, seasonLabel, sortSpreads,
  type Plan, type SeasonBook,
} from '@/lib/seasonBooks/plan'
import { SYSTEM_VERSION } from '@/lib/seasonBooks/system'
import { BeatsView } from './BeatsView'
import { CardsView } from './CardsView'
import { ChaptersView } from './ChaptersView'
import { FlatplanView } from './FlatplanView'
import { MatchDataProvider } from './MatchData'
import { BUTTON, ICON_BUTTON } from './shared'
import { SystemView } from './SystemView'

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

export function BookWorkspace({ slug, initialView, initialSpread }: { slug: string; initialView: BookView; initialSpread: string | null }) {
  const router = useRouter()
  const [book, setBook] = useState<SeasonBook | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [title, setTitle] = useState('')
  const [loadError, setLoadError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveError, setSaveError] = useState('')
  const [tick, setTick] = useState(0)
  const [view, setView] = useState<BookView>(initialView)
  const [spreadId, setSpreadId] = useState<string | null>(initialSpread)

  const planRef = useRef<Plan | null>(null)
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
        const p = { ...b.plan, spreads: sortSpreads(b.seasonStart, b.plan.spreads) }
        setPlan(p)
        planRef.current = p
        setTitle(b.title)
        titleRef.current = b.title
        revision.current = b.revision
      })
      .catch(e => setLoadError(e.message))
  }, [slug])

  // Keep ?view & ?spread shareable without a navigation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('view', view)
    if (spreadId && view === 'cards') params.set('spread', spreadId)
    else params.delete('spread')
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
  }, [view, spreadId])

  const seasonStart = book?.seasonStart ?? 0

  const markDirty = useCallback(() => {
    if (blocked.current) return
    version.current++
    setSaveState('dirty')
    setTick(t => t + 1)
  }, [])

  const edit = useCallback((fn: (p: Plan) => Plan) => {
    if (!planRef.current) return
    const next = fn(planRef.current)
    const sorted = { ...next, spreads: sortSpreads(seasonStart, next.spreads) }
    planRef.current = sorted
    setPlan(sorted)
    markDirty()
  }, [seasonStart, markDirty])

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
      setBook(b => b ? { ...b, revision: data.book.revision, updatedAt: data.book.updatedAt, updatedBy: data.book.updatedBy } : b)
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

  const openSpread = useCallback((id: string) => { setSpreadId(id); setView('cards') }, [])

  const counts = useMemo(() => {
    if (!plan) return null
    return {
      beats: plan.beats.filter(b => b.text.trim()).length,
      spreads: plan.spreads.length,
      carded: plan.spreads.filter(s => s.status !== 'beat').length,
      pacingWarnings: pacingIssues(seasonStart, plan.spreads).filter(i => i.severity === 'warn').length,
      beatWarnings: beatIssues(plan).filter(i => i.severity === 'warn').length,
      cardWarnings: plan.spreads.filter(s => cardIssues(s).some(i => i.severity === 'warn')).length,
    }
  }, [plan, seasonStart])

  async function remove() {
    if (!book || !window.confirm(`Delete the ${seasonLabel(book.seasonStart)} book, its beats and every spread card? This can’t be undone.`)) return
    const r = await fetch(`/api/footshorts/books/${slug}`, { method: 'DELETE' })
    if (r.ok) router.push('/footshorts/books')
    else setSaveError((await r.json().catch(() => ({}))).error ?? 'Delete failed')
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <Link href="/footshorts/books" className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white"><ArrowLeft size={14} /> Books</Link>
        <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">{loadError}</p>
      </div>
    )
  }
  if (!book || !plan || !counts) return <p className="px-6 py-10 text-sm text-neutral-500">Loading book…</p>

  const tabs: { id: BookView; label: string; meta: string; warn?: number }[] = [
    { id: 'beats', label: '1 · Beats', meta: `${counts.beats}/${BEAT_TARGET.min}–${BEAT_TARGET.max}`, warn: counts.beatWarnings },
    { id: 'flatplan', label: '2 · Flatplan', meta: `${counts.spreads} spreads`, warn: counts.pacingWarnings },
    { id: 'cards', label: '3 · Cards', meta: `${counts.carded}/${counts.spreads}`, warn: counts.cardWarnings },
    { id: 'chapters', label: '4 · Chapters', meta: 'thumbnails' },
    { id: 'system', label: 'System', meta: `v${SYSTEM_VERSION}` },
  ]
  const viewProps: BookViewProps = { plan, seasonStart, title, edit, openSpread }

  return (
    <MatchDataProvider seasonStart={book.seasonStart}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-white/10 px-4 pt-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/footshorts/books" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white"><ArrowLeft size={14} /> Books</Link>
            <span className="text-2xl font-extrabold tabular-nums text-white">{seasonLabel(book.seasonStart)}</span>
            <input value={title} onChange={e => editTitle(e.target.value)} aria-label="Book title" maxLength={200}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-lg text-neutral-200 hover:border-white/10 focus:border-white/30 focus:outline-none" />
            <SaveBadge state={saveState} error={saveError} updatedBy={book.updatedBy} onRetry={() => { setSaveState('dirty'); setTick(t => t + 1) }} />
            <button type="button" className={ICON_BUTTON} title="Delete book" onClick={remove}><Trash size={16} /></button>
          </div>
          {saveState === 'conflict' && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              <span>{saveError} Your unsaved edits on this page will be lost.</span>
              <button type="button" className={BUTTON} onClick={() => window.location.reload()}>Reload</button>
            </div>
          )}
          <nav className="mt-3 flex gap-1 overflow-x-auto" aria-label="Book views">
            {tabs.map(t => (
              <button key={t.id} type="button" onClick={() => setView(t.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm ${view === t.id ? 'border-white text-white' : 'border-transparent text-neutral-400 hover:text-neutral-200'}`}>
                {t.id === 'system' && <Lock size={13} />}
                {t.label}
                <span className="text-xs tabular-nums text-neutral-500">{t.meta}</span>
                {!!t.warn && <span className="rounded-full bg-amber-400/15 px-1.5 text-[11px] tabular-nums text-amber-300">{t.warn}</span>}
              </button>
            ))}
          </nav>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === 'beats' && <BeatsView {...viewProps} />}
          {view === 'flatplan' && <FlatplanView {...viewProps} />}
          {view === 'cards' && <CardsView {...viewProps} spreadId={spreadId} setSpreadId={setSpreadId} />}
          {view === 'chapters' && <ChaptersView {...viewProps} />}
          {view === 'system' && <SystemView />}
        </div>
      </div>
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
