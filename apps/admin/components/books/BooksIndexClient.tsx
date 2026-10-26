'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Plus, ShieldStar } from '@phosphor-icons/react'
import { BEAT_TARGET, seasonLabel, seasonSlug, type SeasonBookSummary } from '@/lib/seasonBooks/plan'
import { BOOK_FORMATS, type BookFormat } from '@/lib/seasonBooks/seasonSpreads'
import { SYSTEM_VERSION } from '@/lib/seasonBooks/system'
import { BUTTON, PANEL, PRIMARY, SELECT } from './shared'

const API = '/api/footshorts/books'
const FIRST_SEASON = 2002
const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

/** The series shelf: one book per season since 2002–03, and how far each has got. */
export function BooksIndexClient() {
  const router = useRouter()
  const [books, setBooks] = useState<SeasonBookSummary[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const latest = new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1
  const seasons = useMemo(() => Array.from({ length: latest - FIRST_SEASON + 1 }, (_, i) => FIRST_SEASON + i), [latest])
  const taken = new Set(books.map(b => b.seasonStart))
  const [season, setSeason] = useState<number>(2003)
  const [format, setFormat] = useState<BookFormat>('season-spreads')

  useEffect(() => {
    fetch(API, { cache: 'no-store' })
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? 'Could not load books')
        setBooks(data.books)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function create() {
    setCreating(true)
    setError('')
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seasonStart: season, format }) })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Could not create the book')
      router.push(`/footshorts/books/${data.book.slug}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the book')
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 min-h-0 space-y-6 overflow-y-auto px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-amber-300">Season books · system v{SYSTEM_VERSION}</div>
          <h1 className="text-2xl font-semibold text-white">Books</h1>
          <p className="mt-2 text-sm text-neutral-400">
            One season per book. A <span className="text-neutral-200">season-spreads</span> book is built from data spreads in the team-spread language: a league spread per league,
            one team spread per club in its colours, a competition spread per cup, and honourable mentions; set the roster, work each spread in the editor,
            page the flatplan. A <span className="text-neutral-200">claim-spreads</span> book is the older model: {BEAT_TARGET.min}–{BEAT_TARGET.max} beats, a flatplan and a card per claim.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/footshorts/books/crests" className={BUTTON}><ShieldStar size={16} /> Crests</Link>
          <select className={SELECT} value={season} onChange={e => setSeason(Number(e.target.value))} aria-label="Season">
            {seasons.map(s => <option key={s} value={s} disabled={taken.has(s)}>{seasonLabel(s)}{taken.has(s) ? ' (started)' : ''}</option>)}
          </select>
          <select className={SELECT} value={format} onChange={e => setFormat(e.target.value as BookFormat)} aria-label="Book format">
            {(Object.keys(BOOK_FORMATS) as BookFormat[]).map(f => <option key={f} value={f}>{BOOK_FORMATS[f]}</option>)}
          </select>
          <button type="button" className={PRIMARY} onClick={create} disabled={creating || loading || taken.has(season)}>
            <Plus size={16} weight="bold" /> {creating ? 'Starting…' : 'Start book'}
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
        {seasons.map(s => {
          const book = books.find(b => b.seasonStart === s)
          if (!book) {
            return (
              <button key={s} type="button" onClick={() => setSeason(s)}
                className={`flex aspect-[3/4] flex-col justify-between rounded-lg border border-dashed p-3 text-left transition ${season === s ? 'border-white/40 bg-white/[0.04]' : 'border-white/10 hover:border-white/25'}`}>
                <span className="text-xs text-neutral-600">Not started</span>
                <span className="text-2xl font-semibold tabular-nums text-neutral-600">{seasonLabel(s)}</span>
              </button>
            )
          }
          const v2 = book.format === 'season-spreads'
          const pct = v2 ? (book.spreadCount ? Math.min(1, book.cardedCount / book.spreadCount) : 0) : Math.min(1, book.beatCount / BEAT_TARGET.min)
          return (
            <Link key={s} href={`/footshorts/books/${book.slug}`}
              className="group flex aspect-[3/4] flex-col justify-between rounded-lg border border-white/15 bg-[#F4F1EA] p-3 text-neutral-950 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40">
              <div className="flex items-start justify-between gap-2">
                <BookOpen size={18} weight="duotone" className="text-[#D7372B]" />
                <span className="text-[10px] uppercase tracking-wider text-neutral-500">{DATE.format(new Date(book.updatedAt))}</span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">{BOOK_FORMATS[book.format]}</span>
              <div>
                <div className="text-3xl font-extrabold leading-none tabular-nums">{seasonLabel(s)}</div>
                <div className="mt-1 line-clamp-2 text-xs text-neutral-600">{book.title}</div>
                <dl className="mt-3 grid grid-cols-3 gap-1 text-[10px] uppercase tracking-wider text-neutral-500">
                  <div><dt>{v2 ? 'Pages' : 'Beats'}</dt><dd className="text-sm font-semibold tabular-nums text-neutral-900">{v2 ? book.spreadCount * 2 : book.beatCount}</dd></div>
                  <div><dt>Spreads</dt><dd className="text-sm font-semibold tabular-nums text-neutral-900">{book.spreadCount}</dd></div>
                  <div><dt>{v2 ? 'Drafted' : 'Carded'}</dt><dd className="text-sm font-semibold tabular-nums text-neutral-900">{book.cardedCount}</dd></div>
                </dl>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-300" title={v2 ? 'Spreads drafted, of all' : 'Beats found, of the minimum'}>
                  <div className="h-full bg-[#D7372B]" style={{ width: `${pct * 100}%` }} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      {loading && <p className="text-sm text-neutral-500">Loading books…</p>}
      <p className={`${PANEL} px-4 py-3 text-xs text-neutral-500`}>
        Books read their match data from the private <code>admin_historical_matches</code> table (football-seasons workspace,
        <code> history:import</code>). Book {seasonSlug(2003)} is the pilot season with events and StatsBomb data.
      </p>
    </div>
  )
}
