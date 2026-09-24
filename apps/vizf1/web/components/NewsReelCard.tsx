'use client'

import type { NewsCard } from '@/lib/useNewsFeed'
import { StoryPlaceholder } from './StoryPlaceholder'

// Fades the media out across its bottom half so it melts into the card surface
// the text sits on. Stops follow smoothstep (3t² − 2t³) rather than a straight
// ramp, so there's no visible band where the fade begins or ends.
const MEDIA_FADE = `linear-gradient(to bottom, ${Array.from({ length: 11 }, (_, i) => {
  const t = i / 10
  return `rgb(0 0 0 / ${(1 - t * t * (3 - 2 * t)).toFixed(3)}) ${50 + i * 5}%`
}).join(', ')})`

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
      className="flex h-full w-full flex-col justify-between overflow-hidden rounded-3xl border border-border bg-surface"
    >
      {/* Media takes the space the text leaves, capped at 50vh. On short cards
          (e.g. the 55vh profile carousels) it shrinks rather than clip the text. */}
      <div
        className="relative max-h-[50vh] min-h-0 flex-1"
        style={{ maskImage: MEDIA_FADE, WebkitMaskImage: MEDIA_FADE }}
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
          <StoryPlaceholder visual={card.visual} />
        )}
      </div>
      {/* The negative margin tucks the text into the faded tail of the media
          when space is tight; with room to spare it just sits at the bottom. */}
      <div className="relative z-10 -mt-12 shrink-0 p-6 pb-12">
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
