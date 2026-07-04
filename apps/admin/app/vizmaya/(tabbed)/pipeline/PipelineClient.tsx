'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type {
  PipelineDayBucket,
  PipelineNewsItem,
  PipelineOverviewEntry,
} from '@vismay/content-source/pipelines'
import { appEpicUrl } from '@/lib/publicSite'
import { Badge, isStale, timeAgo } from '@/components/vizmaya/pipeline/shared'

type Relevance = 'relevant' | 'rejected' | 'all'

export default function PipelineClient({ initialEpic }: { initialEpic: string }) {
  const [overview, setOverview] = useState<PipelineOverviewEntry[] | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [news, setNews] = useState<PipelineNewsItem[] | null>(null)
  const [newsErrors, setNewsErrors] = useState<string[]>([])
  const [loadingNews, setLoadingNews] = useState(false)

  const [epic, setEpic] = useState(initialEpic)
  const [topic, setTopic] = useState('')
  const [tag, setTag] = useState('')
  const [relevance, setRelevance] = useState<Relevance>('relevant')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [limit, setLimit] = useState(50)
  // Bumped by the refresh button to re-run both fetch effects.
  const [reloadKey, setReloadKey] = useState(0)

  // Epic scoping changes the topic/tag vocabulary (dc topics + tickers vs iea
  // topics + countries), so switching epics resets both. Keeps the URL
  // shareable without a round-trip through the router.
  function selectEpic(next: string) {
    setEpic(next)
    setTopic('')
    setTag('')
    const url = next ? `/vizmaya/pipeline?epic=${encodeURIComponent(next)}` : '/vizmaya/pipeline'
    window.history.replaceState(null, '', url)
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setOverviewError(null)
      const r = await fetch('/api/vizmaya/pipeline')
      const body = await r.json().catch(() => null)
      if (cancelled) return
      if (!r.ok) {
        setOverviewError(body?.error ?? `HTTP ${r.status}`)
        return
      }
      setOverview(body.overview as PipelineOverviewEntry[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const entries = useMemo(() => overview ?? [], [overview])
  const selected = entries.find((e) => e.meta.epicSlug === epic) ?? null

  // Whether the current scope has a relevance gate to audit. Without one the
  // relevant/rejected select is meaningless — it hides and the fetch pins to
  // 'relevant' (the state is kept so the choice survives scope round-trips).
  const gateInScope = selected
    ? selected.meta.hasRelevanceGate
    : entries.some((e) => e.meta.hasRelevanceGate)
  const effectiveRelevance = gateInScope ? relevance : 'relevant'

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingNews(true)
      setNewsErrors([])
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('relevance', effectiveRelevance)
      if (epic) params.set('epic', epic)
      if (topic) params.set('topic', topic)
      if (tag) params.set('tag', tag)
      if (debouncedQ) params.set('q', debouncedQ)
      const r = await fetch(`/api/vizmaya/pipeline/news?${params}`)
      const body = await r.json().catch(() => null)
      if (cancelled) return
      setLoadingNews(false)
      if (!r.ok) {
        setNewsErrors([body?.error ?? `HTTP ${r.status}`])
        return
      }
      setNews(body.news as PipelineNewsItem[])
      setNewsErrors(
        ((body.errors ?? []) as { epicSlug: string; message: string }[]).map(
          (e) => `${e.epicSlug}: ${e.message}`,
        ),
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [epic, topic, tag, effectiveRelevance, debouncedQ, limit, reloadKey])

  // Topic/tag options come from the scoped epic's 30d breakdown, or the union
  // across epics on the merged feed.
  const topicOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of selected ? [selected] : entries) {
      for (const t of e.health?.news.byTopic ?? []) counts.set(t.key, (counts.get(t.key) ?? 0) + t.count)
    }
    return [...counts].sort((a, b) => b[1] - a[1]).map(([key]) => key)
  }, [entries, selected])

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of selected ? [selected] : entries) {
      for (const t of e.health?.news.byTag ?? []) counts.set(t.key, (counts.get(t.key) ?? 0) + t.count)
    }
    return [...counts].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  }, [entries, selected])

  const tagLabel = selected?.meta.tagLabel ?? 'tags'

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-4 py-5 border-b border-white/5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Content pipelines</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Ingestion health for every epic with a live pipeline — news scrapes, relevance gates,
            recap workers, market feeds — and the merged, epic-tagged news feed below.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/vizmaya/recaps"
            className="text-sm text-neutral-300 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5"
          >
            recaps →
          </Link>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-sm px-3 py-1.5 rounded-lg bg-white text-black hover:bg-neutral-200"
          >
            refresh
          </button>
        </div>
      </div>

      {overviewError && (
        <div className="px-4 py-2 text-xs border-b border-white/5 bg-red-950/20 text-red-300">
          overview: {overviewError}
        </div>
      )}

      <section className="px-4 py-4 border-b border-white/5 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {entries.map((entry) => (
          <EpicHealthCard
            key={entry.meta.epicSlug}
            entry={entry}
            active={epic === entry.meta.epicSlug}
            onSelect={() =>
              selectEpic(epic === entry.meta.epicSlug ? '' : entry.meta.epicSlug)
            }
          />
        ))}
        {!overview && !overviewError && (
          <div className="text-sm text-neutral-500 py-6">loading pipelines…</div>
        )}
      </section>

      <section>
        <div className="px-4 py-3 border-b border-white/5 flex items-baseline justify-between">
          <h2 className="font-medium">News</h2>
          <span className="text-xs text-neutral-500">
            {loadingNews ? 'loading…' : news ? `${news.length} shown` : ''}
          </span>
        </div>
        <div className="px-4 py-2 border-b border-white/5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 mr-1">Epics</span>
          <Chip label="all" active={epic === ''} onClick={() => selectEpic('')} />
          {entries.map((e) => (
            <Chip
              key={e.meta.epicSlug}
              label={e.meta.epicName}
              count={e.health?.news.relevant7d}
              active={epic === e.meta.epicSlug}
              onClick={() =>
                selectEpic(epic === e.meta.epicSlug ? '' : e.meta.epicSlug)
              }
            />
          ))}
        </div>
        <div className="px-4 py-2 border-b border-white/5 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles…"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="flex-1 min-w-40 bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-white/30"
            aria-label="Search news titles"
          />
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="text-sm bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-neutral-100 cursor-pointer"
            aria-label="Filter by topic"
          >
            <option value="">All topics</option>
            {topicOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="text-sm bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-neutral-100 cursor-pointer"
            aria-label={`Filter by ${tagLabel}`}
          >
            <option value="">All {tagLabel}</option>
            {tagOptions.map((t) => (
              <option key={t.key} value={t.key}>
                {t.key} ({t.count})
              </option>
            ))}
          </select>
          {gateInScope && (
            <select
              value={relevance}
              onChange={(e) => setRelevance(e.target.value as Relevance)}
              className="text-sm bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-neutral-100 cursor-pointer"
              aria-label="Filter by classifier verdict"
            >
              <option value="relevant">Relevant</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>
          )}
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="text-sm bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-neutral-100 cursor-pointer"
            aria-label="Result limit"
          >
            {[50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        {newsErrors.map((e) => (
          <div key={e} className="px-4 py-2 text-xs border-b border-white/5 bg-red-950/20 text-red-300">
            news: {e}
          </div>
        ))}
        <ul className="divide-y divide-white/5">
          {(news ?? []).map((n) => (
            <li key={n.key} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-baseline gap-2 min-w-0">
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline truncate"
                  title={n.title}
                >
                  {n.title}
                </a>
                {!n.relevant && (
                  <span className="text-[10px] uppercase tracking-wider text-red-300 font-mono shrink-0">
                    rejected
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-neutral-500">
                <Badge
                  tone="epic"
                  onClick={() => selectEpic(epic === n.epicSlug ? '' : n.epicSlug)}
                >
                  {n.epicSlug}
                </Badge>
                {n.source && <span className="text-neutral-400">{n.source}</span>}
                <span className="tabular-nums" title={n.publishedAt}>
                  {timeAgo(n.publishedAt)}
                </span>
                {n.topics.map((t) => (
                  <Badge key={t} onClick={() => setTopic((cur) => (cur === t ? '' : t))}>
                    {t}
                  </Badge>
                ))}
                {n.tags.map((t) => (
                  <Badge key={t} tone="accent" onClick={() => setTag((cur) => (cur === t ? '' : t))}>
                    {t}
                  </Badge>
                ))}
              </div>
              {n.summary && (
                <p className="text-sm text-neutral-400 mt-1 line-clamp-2">{n.summary}</p>
              )}
            </li>
          ))}
          {news && news.length === 0 && !loadingNews && (
            <li className="px-4 py-8 text-center text-sm text-neutral-500">
              No articles match the current filters — if a pipeline is new, its scrape workflow may
              not have run yet.
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}

function EpicHealthCard({
  entry,
  active,
  onSelect,
}: {
  entry: PipelineOverviewEntry
  active: boolean
  onSelect: () => void
}) {
  const { meta, health, error } = entry
  const explorerUrl = appEpicUrl(meta.appSlug, meta.epicSlug)
  return (
    <div
      className={
        'bg-white/[0.03] border rounded-xl p-4 ' +
        (active ? 'border-white/30' : 'border-white/10')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={active}
          className="text-left font-medium hover:underline"
          title={active ? 'Clear epic filter' : 'Filter the news feed to this epic'}
        >
          {meta.epicName}
        </button>
        <div className="flex items-center gap-2 shrink-0 text-xs">
          {explorerUrl && (
            <Link
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-white"
            >
              explorer ↗
            </Link>
          )}
          <Link href={`/vizmaya/epics/${meta.epicSlug}`} className="text-neutral-400 hover:text-white">
            settings
          </Link>
        </div>
      </div>
      <p className="text-xs text-neutral-500 mt-0.5">{meta.flow}</p>

      {error ? (
        <p className="text-xs text-red-300 bg-red-950/20 rounded-lg px-3 py-2 mt-3">{error}</p>
      ) : health ? (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
            <MiniStat label="24h" value={String(health.news.relevant24h)} />
            <MiniStat label="7d" value={String(health.news.relevant7d)} />
            {meta.hasRelevanceGate ? (
              <MiniStat
                label="Gate keep"
                value={
                  health.news.total > 0
                    ? `${Math.round((health.news.relevant / health.news.total) * 100)}%`
                    : '—'
                }
              />
            ) : (
              <MiniStat label="All-time" value={String(health.news.total)} />
            )}
            <MiniStat
              label="Last fetch"
              value={timeAgo(health.news.latestFetchedAt)}
              warn={isStale(health.news.latestFetchedAt, 36)}
            />
            {health.recaps && (
              <MiniStat
                label="Recap"
                value={timeAgo(health.recaps.latest?.generatedAt ?? null)}
                warn={isStale(health.recaps.latest?.generatedAt, 36)}
              />
            )}
            {health.stocks && (
              <MiniStat
                label="Stocks 7d"
                value={`${health.stocks.tickersFresh7d}/${health.stocks.activeTickers}`}
                warn={health.stocks.tickersFresh7d < health.stocks.activeTickers}
              />
            )}
          </div>
          <VolumeBars days={health.news.byDay} showRejected={meta.hasRelevanceGate} />
        </>
      ) : null}
    </div>
  )
}

function MiniStat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-black/20 border border-white/10 rounded-lg px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 truncate" title={label}>
        {label}
      </div>
      <div className={`text-sm font-semibold tabular-nums truncate ${warn ? 'text-amber-300' : ''}`}>
        {value}
      </div>
    </div>
  )
}

function VolumeBars({ days, showRejected }: { days: PipelineDayBucket[]; showRejected: boolean }) {
  const max = Math.max(1, ...days.map((d) => d.relevant + d.rejected))
  return (
    <div className="mt-3">
      <div className="flex items-end gap-1 h-16">
        {days.map((d) => {
          const total = d.relevant + d.rejected
          return (
            <div
              key={d.day}
              className="flex-1 min-w-0 flex flex-col justify-end h-full"
              title={
                showRejected
                  ? `${d.day}: ${d.relevant} relevant · ${d.rejected} rejected`
                  : `${d.day}: ${d.relevant} stories`
              }
            >
              {d.rejected > 0 && (
                <div
                  className="w-full bg-neutral-600/60 rounded-t-sm"
                  style={{ height: `${(d.rejected / max) * 100}%` }}
                />
              )}
              {d.relevant > 0 && (
                <div
                  className={`w-full bg-emerald-400/80 ${d.rejected > 0 ? '' : 'rounded-t-sm'}`}
                  style={{ height: `${(d.relevant / max) * 100}%` }}
                />
              )}
              {total === 0 && <div className="w-full h-px bg-white/10" />}
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400/80" />
          {showRejected ? 'relevant' : 'stories'}
        </span>
        {showRejected && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-neutral-600/60" /> rejected
          </span>
        )}
        <span className="ml-auto">14d · by published date (UTC)</span>
      </div>
    </div>
  )
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'text-xs px-2 py-1 rounded-full border transition-colors ' +
        (active
          ? 'bg-white/10 text-white border-white/30'
          : 'text-neutral-400 border-white/10 hover:text-white hover:bg-white/5')
      }
    >
      {label}
      {count != null && <span className="text-neutral-500 tabular-nums ml-1">{count}</span>}
    </button>
  )
}
