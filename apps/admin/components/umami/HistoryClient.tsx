'use client'

import { useEffect, useRef, useState } from 'react'
import type { FoodHistoryCoverage, FoodHistoryEvent, FoodHistorySubject } from '@vismay/content-source/epics'

/**
 * Umami "History" tab — review queue for the AI-extracted dish & ingredient
 * history events (migration 071). Pipeline-tab idiom: stat cards + filters +
 * rows, optimistic approve/reject PATCHes. Coordinates render as small mono
 * text (map-less v1); every claim links to its Wikipedia revision permalink.
 */

const KIND_LABELS: Record<string, string> = {
  origin: 'Origin',
  spread: 'Spread',
  introduction: 'Introduction',
  etymology: 'Etymology',
  cultivation: 'Cultivation',
  other: 'Other',
}

const STATUS_STYLES: Record<string, string> = {
  'ai-draft': 'bg-white/[0.06] text-neutral-300',
  reviewed: 'bg-emerald-400/15 text-emerald-300',
  rejected: 'bg-red-400/10 text-red-300',
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'text-emerald-400',
  medium: 'text-amber-400',
  low: 'text-red-400',
}

const fmt = (n: number): string => n.toLocaleString('en-US')

function permalink(e: FoodHistoryEvent): string {
  if (!e.wikiOldid || !e.sourceTitle) return e.sourceUrl
  return `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(e.sourceTitle.replace(/ /g, '_'))}&oldid=${e.wikiOldid}`
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-[120px] flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-neutral-500">{hint}</div>}
    </div>
  )
}

function EventRow({
  e,
  subjectName,
  onSetStatus,
}: {
  e: FoodHistoryEvent
  subjectName: string
  onSetStatus: (id: string, status: FoodHistoryEvent['status']) => void
}) {
  const decided = e.status !== 'ai-draft'
  return (
    <div className="border-b border-white/5 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-neutral-300">
              {subjectName} <span className="text-neutral-600">· {e.subjectKind}</span>
            </span>
            <span className="text-neutral-400">{KIND_LABELS[e.kind] ?? e.kind}</span>
            <span className="text-neutral-500">{e.dateText}</span>
            {e.place && (
              <span className="text-neutral-500">
                {e.place}
                {e.countryCode ? ` (${e.countryCode})` : ''}
              </span>
            )}
            {e.lat != null && e.lng != null && (
              <span className="font-mono text-[10px] text-neutral-600">
                {e.lat.toFixed(2)}, {e.lng.toFixed(2)}
              </span>
            )}
            {e.confidence && (
              <span className={`${CONFIDENCE_STYLES[e.confidence] ?? ''} text-[10px]`}>{e.confidence}</span>
            )}
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_STYLES[e.status]}`}>{e.status}</span>
          </div>
          <p className="text-sm leading-snug text-white">{e.claim}</p>
          <div className="mt-1 text-[11px] text-neutral-600">
            <a href={permalink(e)} target="_blank" rel="noreferrer" className="hover:text-neutral-400 hover:underline">
              {e.sourceTitle ?? 'Wikipedia'} (rev {e.wikiOldid ?? '—'}) ↗
            </a>
            {e.reviewNote && <span className="ml-2 italic">note: {e.reviewNote}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {!decided ? (
            <>
              <button
                type="button"
                onClick={() => onSetStatus(e.id, 'reviewed')}
                className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-400/20"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => onSetStatus(e.id, 'rejected')}
                className="rounded-md border border-red-400/20 bg-red-400/5 px-2.5 py-1 text-xs text-red-300 hover:bg-red-400/15"
              >
                Reject
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onSetStatus(e.id, 'ai-draft')}
              className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-neutral-400 hover:bg-white/[0.08]"
            >
              Revert
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const PAGE = 30

export function HistoryClient() {
  const [coverage, setCoverage] = useState<FoodHistoryCoverage | null>(null)
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<FoodHistorySubject[]>([])

  const [status, setStatus] = useState('ai-draft')
  const [kind, setKind] = useState('')
  const [subjectKind, setSubjectKind] = useState('')
  const [subjectSlug, setSubjectSlug] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<FoodHistoryEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const fetchSeq = useRef(0)

  const refreshCoverage = () => {
    fetch('/api/umami/history/coverage')
      .then((r) => r.json())
      .then((d) => (d.coverage ? setCoverage(d.coverage) : setCoverageError(d.error ?? 'failed')))
      .catch((e) => setCoverageError(String(e)))
  }

  useEffect(() => {
    refreshCoverage()
    fetch('/api/umami/history?subjects=1')
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects ?? []))
      .catch(() => {})
  }, [])

  const listParams = (offset: number) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (kind) params.set('kind', kind)
    if (subjectKind) params.set('subjectKind', subjectKind)
    if (subjectSlug) {
      const [sk, ss] = subjectSlug.split(':')
      params.set('subjectKind', sk)
      params.set('subjectSlug', ss)
    }
    if (q.trim()) params.set('q', q.trim())
    params.set('offset', String(offset))
    params.set('limit', String(PAGE))
    return params
  }

  useEffect(() => {
    const seq = ++fetchSeq.current
    setLoading(true)
    const t = setTimeout(() => {
      fetch(`/api/umami/history?${listParams(0)}`)
        .then((r) => r.json())
        .then((d) => {
          if (seq !== fetchSeq.current) return
          setRows(d.rows ?? [])
          setTotal(d.total ?? 0)
          setLoading(false)
        })
        .catch(() => seq === fetchSeq.current && setLoading(false))
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, kind, subjectKind, subjectSlug, q])

  const loadMore = () => {
    const seq = ++fetchSeq.current
    fetch(`/api/umami/history?${listParams(rows.length)}`)
      .then((r) => r.json())
      .then((d) => {
        if (seq !== fetchSeq.current) return
        setRows((prev) => [...prev, ...(d.rows ?? [])])
        setTotal(d.total ?? 0)
      })
      .catch(() => {})
  }

  const onSetStatus = (id: string, next: FoodHistoryEvent['status']) => {
    // Optimistic: update in place; row leaves the list only on next filter fetch.
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)))
    fetch(`/api/umami/history/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.row) {
          setRows((prev) => prev.map((r) => (r.id === id ? d.row : r)))
          refreshCoverage()
        }
      })
      .catch(() => {})
  }

  const subjectName = (e: FoodHistoryEvent): string => {
    const s = subjects.find((x) => x.kind === e.subjectKind && x.slug === e.subjectSlug)
    return s?.name ?? e.subjectSlug
  }

  const drafts = coverage?.events.byStatus['ai-draft'] ?? 0
  const reviewed = coverage?.events.byStatus['reviewed'] ?? 0
  const rejected = coverage?.events.byStatus['rejected'] ?? 0

  return (
    <div>
      {coverageError && (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
          Coverage unavailable: {coverageError} — has migration 071 been applied and the enrich worker run?
        </div>
      )}

      {coverage && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Stat label="Events" value={fmt(coverage.events.total)} hint={`${fmt(drafts)} awaiting review`} />
          <Stat label="Reviewed" value={fmt(reviewed)} hint={`${fmt(rejected)} rejected`} />
          <Stat
            label="Subjects enriched"
            value={`${fmt(coverage.subjects.enriched)}/${fmt(coverage.subjects.total)}`}
            hint={`${coverage.subjects.dishes} dishes · ${coverage.subjects.ingredients} ingredients`}
          />
          <Stat
            label="Geocoded"
            value={
              coverage.events.withPlace
                ? `${Math.round((coverage.events.geocoded / coverage.events.withPlace) * 100)}%`
                : '—'
            }
            hint={`${fmt(coverage.events.geocoded)}/${fmt(coverage.events.withPlace)} placed events`}
          />
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-300 focus:outline-none"
          >
            <option value="ai-draft">Awaiting review</option>
            <option value="reviewed">Reviewed</option>
            <option value="rejected">Rejected</option>
            <option value="">All statuses</option>
          </select>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-300 focus:outline-none"
          >
            <option value="">All kinds</option>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={subjectSlug ? subjectSlug : subjectKind}
            onChange={(e) => {
              const v = e.target.value
              if (v.includes(':')) {
                setSubjectSlug(v)
                setSubjectKind('')
              } else {
                setSubjectSlug('')
                setSubjectKind(v)
              }
            }}
            className="max-w-[220px] rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-300 focus:outline-none"
          >
            <option value="">All subjects</option>
            <option value="dish">All dishes</option>
            <option value="ingredient">All ingredients</option>
            {subjects.map((s) => (
              <option key={`${s.kind}:${s.slug}`} value={`${s.kind}:${s.slug}`}>
                {s.name} ({s.kind})
              </option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search claims and places"
            className="min-w-[180px] flex-1 rounded-md border border-white/10 bg-neutral-900 px-3 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-white/25 focus:outline-none"
          />
        </div>

        <div className="mb-1 text-xs text-neutral-500">
          {loading ? 'Loading…' : `${fmt(total)} events${rows.length < total ? ` · showing ${fmt(rows.length)}` : ''}`}
        </div>
        <div>
          {rows.map((e) => (
            <EventRow key={e.id} e={e} subjectName={subjectName(e)} onSetStatus={onSetStatus} />
          ))}
          {!loading && rows.length === 0 && (
            <div className="py-6 text-center text-sm text-neutral-600">No events match.</div>
          )}
        </div>
        {rows.length < total && (
          <button
            type="button"
            onClick={loadMore}
            className="mt-3 w-full rounded-md border border-white/10 bg-white/[0.03] py-2 text-sm text-neutral-300 hover:bg-white/[0.06]"
          >
            Load more ({fmt(total - rows.length)} remaining)
          </button>
        )}
      </div>
    </div>
  )
}
