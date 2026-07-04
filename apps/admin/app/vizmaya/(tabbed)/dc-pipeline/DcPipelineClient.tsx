'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { DcNewsAdminItem, DcPipelineStats } from '@vismay/content-source/epics'
import { appEpicUrl } from '@/lib/publicSite'
import { Badge, isStale, timeAgo } from '@/components/vizmaya/dc/shared'

// The four topics the Gemma classifier can assign (scrape-news.ts). The
// selects union these with whatever actually occurs in the data, so a future
// topic still shows up without a code change here.
const KNOWN_TOPICS = ['ai', 'data-centers', 'semiconductors', 'microprocessors']

type Relevance = 'relevant' | 'rejected' | 'all'

export default function DcPipelineClient() {
  const [stats, setStats] = useState<DcPipelineStats | null>(null)
  const [news, setNews] = useState<DcNewsAdminItem[] | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [newsError, setNewsError] = useState<string | null>(null)
  const [loadingNews, setLoadingNews] = useState(false)

  const [topic, setTopic] = useState('')
  const [ticker, setTicker] = useState('')
  const [relevance, setRelevance] = useState<Relevance>('relevant')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [limit, setLimit] = useState(50)
  // Bumped by the refresh button to re-run both fetch effects.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatsError(null)
      const r = await fetch('/api/vizmaya/dc-pipeline')
      const body = await r.json().catch(() => null)
      if (cancelled) return
      if (!r.ok) {
        setStatsError(body?.error ?? `HTTP ${r.status}`)
        return
      }
      setStats(body.stats as DcPipelineStats)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingNews(true)
      setNewsError(null)
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('relevance', relevance)
      if (topic) params.set('topic', topic)
      if (ticker) params.set('ticker', ticker)
      if (debouncedQ) params.set('q', debouncedQ)
      const r = await fetch(`/api/vizmaya/dc-pipeline/news?${params}`)
      const body = await r.json().catch(() => null)
      if (cancelled) return
      setLoadingNews(false)
      if (!r.ok) {
        setNewsError(body?.error ?? `HTTP ${r.status}`)
        return
      }
      setNews(body.news as DcNewsAdminItem[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [topic, ticker, relevance, debouncedQ, limit, reloadKey])

  const explorerUrl = appEpicUrl('vizmaya-fyi', 'ai-data-centers')

  const topicOptions = useMemo(() => {
    const seen = new Set(KNOWN_TOPICS)
    for (const t of stats?.news.byTopic ?? []) seen.add(t.topic)
    return [...seen]
  }, [stats])

  const relevanceRate = useMemo(() => {
    if (!stats || stats.news.total === 0) return null
    return Math.round((stats.news.relevant / stats.news.total) * 100)
  }, [stats])

  const latestRecap = stats?.recaps.latest ?? null

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-4 py-5 border-b border-white/5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">AI Data Centers · news pipeline</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Daily Google News scrape → Gemma relevance gate → recap worker, plus the related-stock
            price feed. Crons run in GitHub Actions (scrape 06:45 · recap 08:15 · stocks 22:45 UTC).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {explorerUrl && (
            <Link
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-neutral-300 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5"
            >
              explorer →
            </Link>
          )}
          <Link
            href="/vizmaya/epics/ai-data-centers"
            className="text-sm text-neutral-300 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5"
          >
            epic settings
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

      {statsError && (
        <div className="px-4 py-2 text-xs border-b border-white/5 bg-red-950/20 text-red-300">
          stats: {statsError}
        </div>
      )}

      <section className="px-4 py-4 border-b border-white/5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile
            label="Stories · 24h"
            value={stats ? String(stats.news.relevant24h) : '…'}
            hint="relevant, by published time"
          />
          <StatTile
            label="Stories · 7d"
            value={stats ? String(stats.news.relevant7d) : '…'}
            hint="relevant, by published time"
          />
          <StatTile
            label="Relevance rate"
            value={relevanceRate == null ? (stats ? '—' : '…') : `${relevanceRate}%`}
            hint={
              stats
                ? `${stats.news.relevant} kept · ${stats.news.rejected} rejected all-time`
                : 'kept vs rejected all-time'
            }
          />
          <StatTile
            label="Last scrape"
            value={stats ? timeAgo(stats.news.latestFetchedAt) : '…'}
            hint="newest dc_news fetch"
            warn={isStale(stats?.news.latestFetchedAt, 36)}
          />
          <StatTile
            label="Latest recap"
            value={stats ? timeAgo(latestRecap?.generatedAt ?? null) : '…'}
            hint={
              latestRecap
                ? `${latestRecap.articleCount} stories · ${latestRecap.model ?? 'deterministic'}`
                : 'no recap generated yet'
            }
            warn={isStale(latestRecap?.generatedAt, 36)}
          />
          <StatTile
            label="Recap runs"
            value={stats ? String(stats.recaps.total) : '…'}
            hint="snapshot rows in dc_news_recaps"
          />
          <StatTile
            label="Stock feed"
            value={stats ? (stats.stocks.latestTradeDate ?? 'no bars') : '…'}
            hint="newest close bar (exchange calendar)"
          />
          <StatTile
            label="Tickers fresh · 7d"
            value={stats ? `${stats.stocks.tickersFresh7d}/${stats.stocks.activeTickers}` : '…'}
            hint="active tickers with a bar this week"
            warn={stats ? stats.stocks.tickersFresh7d < stats.stocks.activeTickers : false}
          />
        </div>
      </section>

      {stats && (
        <section className="px-4 py-4 border-b border-white/5 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xs uppercase tracking-[0.18em] text-neutral-400 mb-3">
              Scrape volume · last 14 days
            </h2>
            <VolumeBars days={stats.news.byDay} />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs uppercase tracking-[0.18em] text-neutral-400">Latest recap</h2>
              <Link href="/vizmaya/dc-recaps" className="text-xs text-neutral-400 hover:text-white">
                all recaps →
              </Link>
            </div>
            {latestRecap ? (
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <div className="font-medium">
                  {latestRecap.headline ?? 'Deterministic brief (no LLM headline)'}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {timeAgo(latestRecap.generatedAt)} · {latestRecap.windowHours}h window ·{' '}
                  {latestRecap.articleCount} stories · {latestRecap.model ?? 'deterministic'}
                </div>
                {latestRecap.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {latestRecap.topics.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                )}
                <details className="mt-3">
                  <summary className="text-xs text-neutral-400 hover:text-white cursor-pointer select-none">
                    show markdown
                  </summary>
                  <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs text-neutral-300 bg-black/30 border border-white/10 rounded-lg p-3">
                    {latestRecap.markdown}
                  </pre>
                </details>
              </div>
            ) : (
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 text-sm text-neutral-500">
                No recap yet — dispatch the &ldquo;Generate DC news recap&rdquo; workflow after the
                first scrape has landed.
              </div>
            )}
          </div>
        </section>
      )}

      {stats && (stats.news.byTopic.length > 0 || stats.news.byTicker.length > 0) && (
        <section className="px-4 py-4 border-b border-white/5 space-y-3">
          {stats.news.byTopic.length > 0 && (
            <ChipRow
              label="Topics · 30d"
              chips={stats.news.byTopic.map((t) => ({ key: t.topic, count: t.count }))}
              selected={topic}
              onToggle={(key) => setTopic((cur) => (cur === key ? '' : key))}
            />
          )}
          {stats.news.byTicker.length > 0 && (
            <ChipRow
              label="Tickers · 30d"
              chips={stats.news.byTicker.slice(0, 14).map((t) => ({ key: t.ticker, count: t.count }))}
              selected={ticker}
              onToggle={(key) => setTicker((cur) => (cur === key ? '' : key))}
            />
          )}
        </section>
      )}

      <section>
        <div className="px-4 py-3 border-b border-white/5 flex items-baseline justify-between">
          <h2 className="font-medium">News</h2>
          <span className="text-xs text-neutral-500">
            {loadingNews ? 'loading…' : news ? `${news.length} shown` : ''}
          </span>
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
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="text-sm bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-neutral-100 cursor-pointer"
            aria-label="Filter by ticker"
          >
            <option value="">All tickers</option>
            {(stats?.news.byTicker ?? []).map((t) => (
              <option key={t.ticker} value={t.ticker}>
                {t.ticker} ({t.count})
              </option>
            ))}
          </select>
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
        {newsError && (
          <div className="px-4 py-2 text-xs border-b border-white/5 bg-red-950/20 text-red-300">
            news: {newsError}
          </div>
        )}
        <ul className="divide-y divide-white/5">
          {(news ?? []).map((n) => (
            <li key={n.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
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
                {n.source && <span className="text-neutral-400">{n.source}</span>}
                <span className="tabular-nums" title={n.publishedAt}>
                  {timeAgo(n.publishedAt)}
                </span>
                {n.topics.map((t) => (
                  <Badge key={t} onClick={() => setTopic((cur) => (cur === t ? '' : t))}>
                    {t}
                  </Badge>
                ))}
                {n.tickers.map((t) => (
                  <Badge key={t} accent onClick={() => setTicker((cur) => (cur === t ? '' : t))}>
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
              {stats && stats.news.total === 0
                ? 'No articles scraped yet — run the "Scrape AI data centers news" workflow (or wait for the 06:45 UTC cron).'
                : 'No articles match the current filters.'}
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}

function StatTile({
  label,
  value,
  hint,
  warn = false,
}: {
  label: string
  value: string
  hint: string
  warn?: boolean
}) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 tabular-nums ${warn ? 'text-amber-300' : ''}`}>
        {value}
      </div>
      <div className="text-[11px] text-neutral-500 mt-0.5 truncate" title={hint}>
        {hint}
      </div>
    </div>
  )
}

function VolumeBars({
  days,
}: {
  days: { day: string; relevant: number; rejected: number }[]
}) {
  const max = Math.max(1, ...days.map((d) => d.relevant + d.rejected))
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
      <div className="flex items-end gap-1.5 h-28">
        {days.map((d) => {
          const total = d.relevant + d.rejected
          return (
            <div
              key={d.day}
              className="flex-1 min-w-0 flex flex-col justify-end h-full"
              title={`${d.day}: ${d.relevant} relevant · ${d.rejected} rejected`}
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
      <div className="flex gap-1.5 mt-1">
        {days.map((d) => (
          <div key={d.day} className="flex-1 min-w-0 text-center text-[9px] text-neutral-600 tabular-nums">
            {d.day.slice(8)}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400/80" /> relevant
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-neutral-600/60" /> rejected
        </span>
        <span className="ml-auto">by published date (UTC)</span>
      </div>
    </div>
  )
}

function ChipRow({
  label,
  chips,
  selected,
  onToggle,
}: {
  label: string
  chips: { key: string; count: number }[]
  selected: string
  onToggle: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-neutral-500 mr-1">{label}</span>
      {chips.map((c) => {
        const active = selected === c.key
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onToggle(c.key)}
            aria-pressed={active}
            className={
              'text-xs px-2 py-1 rounded-full border transition-colors ' +
              (active
                ? 'bg-white/10 text-white border-white/30'
                : 'text-neutral-400 border-white/10 hover:text-white hover:bg-white/5')
            }
          >
            {c.key} <span className="text-neutral-500 tabular-nums">{c.count}</span>
          </button>
        )
      })}
    </div>
  )
}
