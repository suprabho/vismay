'use client'

import { useNewsFeed, type NewsCard } from '@/lib/useNewsFeed'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

function Card({ card }: { card: NewsCard }) {
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-full snap-start flex-col rounded-2xl border border-border bg-surface p-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {card.publisher}
        </span>
        <span className="text-[11px] text-muted">{relativeTime(card.publishedAt)}</span>
      </div>
      <h3 className="text-lg font-semibold text-text">{card.headline}</h3>
      <p className="mt-3 text-sm leading-relaxed text-text/80">{card.summary}</p>
      <span className="mt-auto pt-4 text-xs text-accent">Read on {card.publisher} →</span>
    </a>
  )
}

export function DiscoverStack() {
  const q = useNewsFeed()
  if (q.isLoading)
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  const items = q.data ?? []
  if (items.length === 0)
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        No news yet — TODO(vizf1-scaffold): wire RSS ingest.
      </div>
    )

  return (
    <div
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4"
      style={{ scrollbarWidth: 'none' }}
    >
      {items.map((c) => (
        <div key={c.id} className="h-[60vh] w-[85vw] flex-shrink-0 sm:w-[420px]">
          <Card card={c} />
        </div>
      ))}
    </div>
  )
}
