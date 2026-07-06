'use client'

import type { NewsCard } from '@/lib/useNewsFeed'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export function NewsReelCard({ card }: { card: NewsCard }) {
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative flex h-full w-full flex-col justify-end overflow-hidden rounded-3xl border border-border bg-surface"
    >
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-surface to-bg" aria-hidden />
      )}
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            'linear-gradient(to top, rgba(11,13,18,0.95) 0%, rgba(11,13,18,0.65) 30%, rgba(11,13,18,0.1) 70%, rgba(11,13,18,0.0) 100%)',
        }}
      />
      <div className="relative z-10 p-6 pb-12">
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider">
          <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-text">
            {card.publisher}
          </span>
          <span className="text-text/70">{relativeTime(card.publishedAt)}</span>
          {card.topicCategory ? (
            <span className="rounded-full border border-text/20 px-2 py-0.5 text-text/70">
              {card.topicCategory.replace('_', ' ')}
            </span>
          ) : null}
        </div>
        <h2 className="text-2xl font-semibold leading-tight text-text">{card.headline}</h2>
        <p className="mt-3 line-clamp-5 text-sm leading-relaxed text-text/80">{card.summary}</p>
        <span className="mt-4 inline-block text-xs font-medium text-accent">
          Read on {card.publisher} →
        </span>
      </div>
    </a>
  )
}
