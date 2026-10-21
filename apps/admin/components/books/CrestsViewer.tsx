'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type HTMLAttributes } from 'react'
import {
  ArrowLeft, ArrowSquareOut, CircleNotch, ImageBroken, MagnifyingGlass, MagicWand, Stop, Trash, UploadSimple, Warning, X,
} from '@phosphor-icons/react'
import { CREST_UPLOAD_MAX_BYTES, CREST_UPLOAD_TYPES } from '@footshorts/shared/historicalCrests'
import {
  CREST_FILTERS, CREST_STATUS_META, crestCounts, crestStatus, duplicateCodes, groupCrests, matchesCrestFilter, needsMark,
  type CrestFilter, type CrestView,
} from '@/lib/seasonBooks/crests'
import { BUTTON, ICON_BUTTON, INPUT, PANEL, PRIMARY, SELECT } from './shared'
import { ClubMarkPanel, MarkTile, markCaption, type MarkAction } from './ClubMarkPanel'

const API = '/api/footshorts/books/crests'
const ACCEPT = Object.keys(CREST_UPLOAD_TYPES).join(',')
const FILTER_LABEL: Record<CrestFilter, string> = {
  all: 'All', missing: 'Missing', current: 'Current only', flagged: 'Flagged', uploaded: 'Uploaded',
  unmarked: 'No mark yet', 'mark-review': 'Mark review',
}
type View = 'picked' | 'marks'
type Batch = { total: number; done: number; current: string }
const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
const key = (c: CrestView) => c.wiki
type DropProps = Pick<HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'>

function wikiUrl(wiki: string): string | null {
  if (wiki.startsWith('name:')) return null
  const m = wiki.match(/^([a-z]{2}):(.+)$/)
  const [lang, title] = m ? [m[1], m[2]!] : ['en', wiki]
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

const CAPTION: Record<string, string> = { uploaded: 'text-sky-300', missing: 'text-rose-300', current: 'text-rose-300', season: 'text-neutral-500' }
const sourceName: Record<string, string> = { logopedia: 'Logopedia', wikidata: 'Wikidata', thesportsdb: 'TheSportsDB' }

/**
 * Books → Crests: every club of a season (the top flights and each cup opponent)
 * with the crest it wore, and an upload for any that is missing or wrong.
 */
export function CrestsViewer({ initialSeason, initialFilter, initialView }: { initialSeason: string | null; initialFilter: CrestFilter; initialView: View }) {
  const [requested, setRequested] = useState<string | null>(initialSeason)
  const [seasons, setSeasons] = useState<string[]>([])
  const [season, setSeason] = useState<string | null>(null)
  const [crests, setCrests] = useState<CrestView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<CrestFilter>(initialFilter)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [view, setView] = useState<View>(initialView)
  const [batch, setBatch] = useState<Batch | null>(null)
  const stopBatch = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadFor = useRef<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(requested ? `${API}?season=${encodeURIComponent(requested)}` : API, { signal: controller.signal, cache: 'no-store' })
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? 'Could not load crests')
        if (controller.signal.aborted) return
        setSeasons(data.seasons)
        setSeason(data.season)
        setCrests(data.crests)
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [requested])

  // Keep ?season, ?filter & ?view shareable without a navigation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (season) params.set('season', season)
    if (filter === 'all') params.delete('filter'); else params.set('filter', filter)
    if (view === 'picked') params.delete('view'); else params.set('view', view)
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
  }, [season, filter, view])

  const counts = useMemo(() => crestCounts(crests), [crests])
  const dupes = useMemo(() => duplicateCodes(crests), [crests])
  const groups = useMemo(() => groupCrests(crests.filter(c => matchesCrestFilter(c, filter, query, dupes))), [crests, filter, query, dupes])
  const shown = groups.reduce((n, g) => n + g.crests.length, 0)
  const current = crests.find(c => key(c) === selected) ?? null

  const setBusyFor = (wiki: string, on: boolean) => setBusy(s => { const n = new Set(s); if (on) n.add(wiki); else n.delete(wiki); return n })
  const replace = (crest: CrestView) => setCrests(list => list.map(c => key(c) === key(crest) ? crest : c))

  /** The club-mark review queue: generate, override (written back into the input) or confirm; errors come back as the mark. */
  const markAction = useCallback(async (wiki: string, action: MarkAction): Promise<boolean> => {
    if (!season) return false
    setNotice('')
    setBusyFor(wiki, true)
    try {
      const r = await fetch(`${API}/marks`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ season, wiki, ...action }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Could not update the club mark')
      replace(data.crest)
      return true
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not update the club mark')
      return false
    } finally {
      setBusyFor(wiki, false)
    }
  }, [season])

  // One club at a time: each takes its season's codes and its league's marks into account.
  async function generateAll() {
    const todo = crests.filter(needsMark)
    if (!todo.length) return
    stopBatch.current = false
    for (const [i, c] of todo.entries()) {
      if (stopBatch.current) break
      setBatch({ total: todo.length, done: i, current: c.name })
      if (!(await markAction(key(c), { action: 'generate' }))) break
    }
    setBatch(null)
  }

  const upload = useCallback(async (wiki: string, file: File) => {
    if (!season) return
    setNotice('')
    if (!(file.type in CREST_UPLOAD_TYPES) && !/\.(png|svg|webp|jpe?g|gif)$/i.test(file.name)) { setNotice('Upload a PNG, SVG, WebP, JPEG or GIF image.'); return }
    if (file.size > CREST_UPLOAD_MAX_BYTES) { setNotice(`Crests can be up to ${CREST_UPLOAD_MAX_BYTES / 1024 / 1024} MB.`); return }
    setBusyFor(wiki, true)
    try {
      const form = new FormData()
      form.set('season', season)
      form.set('wiki', wiki)
      form.set('file', file)
      const r = await fetch(`${API}/upload`, { method: 'POST', body: form })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Upload failed')
      replace(data.crest)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Upload failed')
      return
    } finally {
      setBusyFor(wiki, false)
    }
    // The family is read from the crest: a new upload regenerates the mark.
    await markAction(wiki, { action: 'generate' })
  }, [season, markAction])

  async function removeUpload(wiki: string) {
    if (!season || !window.confirm('Remove the uploaded crest? The club goes back to the picked crest (or none).')) return
    setNotice('')
    setBusyFor(wiki, true)
    let picked = false
    try {
      const r = await fetch(`${API}/upload`, {
        method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ season, wiki }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Could not remove the upload')
      replace(data.crest)
      picked = !!data.crest.file_url
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not remove the upload')
    } finally {
      setBusyFor(wiki, false)
    }
    // Back on the picked crest: regenerate the mark from it.
    if (picked) await markAction(wiki, { action: 'generate' })
  }

  function pickFile(wiki: string) {
    uploadFor.current = wiki
    fileInput.current?.click()
  }

  // Escape closes the detail panel.
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const dropProps = (wiki: string): DropProps => ({
    onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(wiki) } },
    onDragLeave: () => setDragOver(d => d === wiki ? null : d),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setDragOver(null)
      const file = e.dataTransfer.files[0]
      if (file) void upload(wiki, file)
    },
  })

  return (
    <div className="flex min-h-0 flex-1">
      <div className="mx-auto w-full max-w-7xl min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <Link href="/footshorts/books" className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white"><ArrowLeft size={14} /> Books</Link>
            <h1 className="text-2xl font-semibold text-white">Crests</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Every top-flight club of the season and every cup opponent, with the crest it wore that season.
              Drop an image on a club, or open it, to fill a missing crest or replace a wrong one. Uploads win over the picked crest.
            </p>
          </div>
          <select className={SELECT} value={season ?? ''} aria-label="Season" disabled={!seasons.length}
            onChange={e => { setRequested(e.target.value); setLoading(true); setError(''); setSelected(null) }}>
            {seasons.map(s => <option key={s} value={s}>{s.replace('-', '–')}</option>)}
          </select>
        </div>

        {error && <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        {!error && (
          <div className={`${PANEL} sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-neutral-950/95 px-3 py-2 backdrop-blur`}>
            <Segmented value={view} onChange={setView} options={[['picked', 'Crests'], ['marks', 'Club marks']]} label="Shown" />
            <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
            {CREST_FILTERS.map(f => {
              const n = f === 'all' ? counts.total : counts[f]
              return (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                  className={`rounded-md border px-2.5 py-1 text-sm tabular-nums transition ${filter === f ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-neutral-400 hover:text-white'}`}>
                  {FILTER_LABEL[f]} <span className="text-neutral-500">{n}</span>
                </button>
              )
            })}
            <span className="hidden text-xs text-neutral-500 sm:inline">{counts.season} dated to the season · {counts.marked} marks</span>
            {batch ? (
              <span className="inline-flex items-center gap-2 text-xs text-neutral-300">
                <CircleNotch size={14} className="animate-spin" />
                Generating marks {batch.done + 1}/{batch.total} · {batch.current}
                <button type="button" className={BUTTON} onClick={() => { stopBatch.current = true }}><Stop size={14} /> Stop</button>
              </span>
            ) : counts.toGenerate > 0 && (
              <button type="button" className={BUTTON} onClick={() => void generateAll()} disabled={!season}
                title="Generate the club mark of every club that has none (or a stale one), one at a time">
                <MagicWand size={14} /> Generate {counts.toGenerate} marks
              </button>
            )}
            <label className="relative ml-auto w-full sm:w-64">
              <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input className={`${INPUT} pl-8`} placeholder="Club, country, competition…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search clubs" />
            </label>
          </div>
        )}

        {notice && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            <Warning size={16} weight="fill" className="mt-0.5 shrink-0" /> <span className="flex-1">{notice}</span>
            <button type="button" className={ICON_BUTTON} onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button>
          </p>
        )}

        {loading && <p className="text-sm text-neutral-500">Loading crests…</p>}
        {!loading && !error && !crests.length && (
          <p className={`${PANEL} px-4 py-3 text-sm text-neutral-400`}>
            No crests yet. Build them with <code>scripts/crests.py</code> and push them with <code>pnpm --filter @footshorts/worker history:crests-sync -- --season=2003 --push</code>.
          </p>
        )}
        {!loading && crests.length > 0 && !shown && <p className="text-sm text-neutral-500">No clubs match.</p>}

        {groups.map(({ group, crests: list }) => (
          <section key={group}>
            <h2 className="mb-2 flex items-baseline gap-2 border-b border-white/10 pb-1.5 text-sm font-semibold text-white">
              {group} <span className="font-normal tabular-nums text-neutral-500">{list.length}</span>
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2.5">
              {list.map(c => {
                const status = crestStatus(c)
                const working = busy.has(key(c))
                return (
                  <div key={key(c)} {...dropProps(key(c))}
                    className={`group relative flex flex-col rounded-lg border transition ${dragOver === key(c) ? 'border-sky-400 ring-2 ring-sky-400/40'
                      : selected === key(c) ? 'border-white/50' : c.needs_review && status !== 'uploaded' ? 'border-amber-400/40' : 'border-white/10 hover:border-white/25'}`}>
                    <button type="button" onClick={() => setSelected(key(c))} className="flex flex-1 flex-col items-center gap-2 p-2.5 text-center">
                      {view === 'marks' ? <MarkTile crest={c} /> : <CrestImage crest={c} size="sm" />}
                      <span className="line-clamp-2 text-xs font-medium leading-tight text-neutral-100">{c.name}</span>
                      {view === 'marks' ? (
                        <span className={`text-[11px] leading-tight ${markCaption(c, dupes).className}`}>{markCaption(c, dupes).text}</span>
                      ) : (
                        <span className={`text-[11px] leading-tight ${CAPTION[status]}`}>
                          {status === 'uploaded' ? 'Uploaded' : status === 'missing' ? 'No crest' : status === 'current' ? 'Today’s crest' : c.era_label}
                        </span>
                      )}
                    </button>
                    <button type="button" title={status === 'missing' ? 'Upload crest' : 'Replace crest'} disabled={working}
                      onClick={() => pickFile(key(c))}
                      className={`absolute right-1 top-1 ${ICON_BUTTON} ${status === 'missing' || working ? '' : 'opacity-0 focus:opacity-100 group-hover:opacity-100'}`}>
                      {working ? <CircleNotch size={14} className="animate-spin" /> : <UploadSimple size={14} />}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ))}

        <p className={`${PANEL} px-4 py-3 text-xs text-neutral-500`}>
          Crests are picked by <code>vizmaya-data/football-seasons/scripts/crests.py</code> from Logopedia’s dated logo timelines
          (Wikidata dated logos next; Wikidata or TheSportsDB for today’s crest when nothing is dated) and pushed with
          <code> history:crests-sync</code>. Uploads live in the private <code>admin-season-crests</code> bucket;
          <code> history:crests-sync -- --pull</code> copies them into the workspace. <strong className="font-medium text-neutral-400">Club marks</strong>
          come from <code>toClubMark()</code> (<code>@vismay/club-marks</code>): the crest only picks the family (roundel, heater, oval, plate),
          the fill is the home kit from <code>data/kits.csv</code> (<code>scripts/kits.py</code>, Wikipedia), and the code is the club&apos;s
          three-letter abbreviation. No official crest appears on a spread. Rows pull to <code>data/club_marks.csv</code> with
          <code> history:club-marks-sync -- --pull</code>.
          Crests are trademarks: clear them before print.
        </p>
      </div>

      {current && (
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-neutral-950 p-4 md:block lg:w-96" aria-label={`${current.name} crest`}>
          <CrestDetail crest={current} busy={busy.has(key(current))} onClose={() => setSelected(null)} onMark={action => void markAction(key(current), action)} dupes={dupes}
            onUpload={() => pickFile(key(current))} onRemove={() => removeUpload(key(current))} dropProps={dropProps(key(current))} dragging={dragOver === key(current)} />
        </aside>
      )}
      {current && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/60 md:hidden" onClick={() => setSelected(null)}>
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-xl border-t border-white/10 bg-neutral-950 p-4" onClick={e => e.stopPropagation()}>
            <CrestDetail crest={current} busy={busy.has(key(current))} onClose={() => setSelected(null)} onMark={action => void markAction(key(current), action)} dupes={dupes}
              onUpload={() => pickFile(key(current))} onRemove={() => removeUpload(key(current))} dropProps={dropProps(key(current))} dragging={dragOver === key(current)} />
          </div>
        </div>
      )}

      <input ref={fileInput} type="file" accept={ACCEPT} className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          const wiki = uploadFor.current
          e.target.value = ''
          if (file && wiki) void upload(wiki, file)
        }} />
    </div>
  )
}

function CrestImage({ crest, size }: { crest: CrestView; size: 'sm' | 'lg' }) {
  // Keyed by URL, so a replaced crest gets a fresh try.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const broken = !!crest.image_url && brokenUrl === crest.image_url
  const box = size === 'sm' ? 'h-20 w-20 p-2' : 'h-48 w-full p-6'
  if (!crest.image_url || broken) {
    return (
      <div className={`${box} flex items-center justify-center rounded-md border border-dashed border-rose-400/40 text-rose-300/80`}>
        {broken ? <ImageBroken size={size === 'sm' ? 22 : 36} /> : <UploadSimple size={size === 'sm' ? 22 : 36} />}
      </div>
    )
  }
  // Crests are drawn for white kit and paper: show them on the book's paper tone.
  return (
    <div className={`${box} flex items-center justify-center rounded-md bg-[#F4F1EA]`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote and signed URLs, sizes vary */}
      <img src={crest.image_url} alt={`${crest.name} crest`} loading="lazy" referrerPolicy="no-referrer"
        className="max-h-full max-w-full object-contain" onError={() => setBrokenUrl(crest.image_url)} />
    </div>
  )
}

function CrestDetail({ crest, busy, onClose, onMark, dupes, onUpload, onRemove, dropProps, dragging }: {
  crest: CrestView
  busy: boolean
  onClose: () => void
  onMark: (action: MarkAction) => void
  dupes: Set<string>
  onUpload: () => void
  onRemove: () => void
  dropProps: DropProps
  dragging: boolean
}) {
  const status = crestStatus(crest)
  const wiki = wikiUrl(crest.wiki)
  const rows: [string, string][] = [
    ['League', crest.top_flight || 'Cup opponent'],
    ['Cups', crest.competitions || '—'],
    ['Country', crest.country || '—'],
    ['Picked crest', crest.file ? `${crest.era_label || 'undated'} · ${sourceName[crest.source] ?? crest.source}${crest.era === 'current' ? ' (today’s crest)' : ''}` : 'None found'],
    ['Crosswalk id', crest.canonical_id || '—'],
  ]
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">{crest.name}</h2>
          <span className={`mt-1 inline-block rounded border px-1.5 text-[11px] ${CREST_STATUS_META[status].className}`}>{CREST_STATUS_META[status].label}</span>
        </div>
        <button type="button" className={ICON_BUTTON} onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <div {...dropProps} className={`rounded-lg ${dragging ? 'ring-2 ring-sky-400' : ''}`}>
        <CrestImage crest={crest} size="lg" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} onClick={onUpload} disabled={busy}>
          {busy ? <CircleNotch size={16} className="animate-spin" /> : <UploadSimple size={16} />}
          {status === 'missing' ? 'Upload crest' : 'Replace crest'}
        </button>
        {status === 'uploaded' && (
          <button type="button" className={BUTTON} onClick={onRemove} disabled={busy}><Trash size={16} /> Remove upload</button>
        )}
      </div>
      <p className="text-xs text-neutral-500">PNG, SVG, WebP, JPEG or GIF up to {CREST_UPLOAD_MAX_BYTES / 1024 / 1024} MB, or drop a file on the crest.</p>
      {crest.needs_review && crest.review_note && status !== 'uploaded' && (
        <p className="flex gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-2 text-xs text-amber-200">
          <Warning size={14} weight="fill" className="mt-0.5 shrink-0" /> {crest.review_note}
        </p>
      )}
      {status === 'uploaded' && crest.uploaded_at && (
        <p className="text-xs text-neutral-400">Uploaded {DATE.format(new Date(crest.uploaded_at))}{crest.uploaded_by ? ` by ${crest.uploaded_by}` : ''}.</p>
      )}
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[7rem_1fr] gap-2">
            <dt className="text-neutral-500">{k}</dt><dd className="break-words text-neutral-200">{v}</dd>
          </div>
        ))}
      </dl>
      <ClubMarkPanel crest={crest} busy={busy} onMark={onMark} dupes={dupes} />
      <div className="flex flex-wrap gap-3 text-sm">
        {wiki && <a className="inline-flex items-center gap-1 text-sky-300 hover:underline" href={wiki} target="_blank" rel="noreferrer">Wikipedia <ArrowSquareOut size={12} /></a>}
        {crest.logopedia_page && (
          <a className="inline-flex items-center gap-1 text-sky-300 hover:underline" target="_blank" rel="noreferrer"
            href={`https://logos.fandom.com/wiki/${encodeURIComponent(crest.logopedia_page.replace(/ /g, '_'))}`}>Logopedia <ArrowSquareOut size={12} /></a>
        )}
        {crest.file_url && <a className="inline-flex items-center gap-1 text-sky-300 hover:underline" href={crest.file_url} target="_blank" rel="noreferrer">Picked file <ArrowSquareOut size={12} /></a>}
        {crest.qid && <a className="inline-flex items-center gap-1 text-sky-300 hover:underline" href={`https://www.wikidata.org/wiki/${crest.qid}`} target="_blank" rel="noreferrer">{crest.qid} <ArrowSquareOut size={12} /></a>}
      </div>
    </div>
  )
}

function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T
  onChange: (v: T) => void
  options: [T, string][]
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-white/15 p-0.5">
      {options.map(([v, text]) => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
          className={`rounded px-2 py-0.5 text-sm transition ${value === v ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'}`}>
          {text}
        </button>
      ))}
    </div>
  )
}
