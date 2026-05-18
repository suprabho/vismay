'use client'

import { useEffect, useRef } from 'react'
import type { NewsCard } from '@/lib/useNewsFeed'
import { NewsReelCard } from './NewsReelCard'

/**
 * Vertical TikTok-style pager.
 *
 * Each card is a full-screen snap-target. IntersectionObserver fires
 * `onCardSeen` when a card is ~70% visible — analytics seam for when we wire
 * an article_views table.
 */
export function NewsReel({
  items,
  onCardSeen,
}: {
  items: NewsCard[]
  onCardSeen?: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!onCardSeen) return
    const root = containerRef.current
    if (!root) return
    const cb = onCardSeen
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
            const id = (entry.target as HTMLElement).dataset.cardId
            if (id && !seenRef.current.has(id)) {
              seenRef.current.add(id)
              cb(id)
            }
          }
        }
      },
      { root, threshold: [0.7] },
    )
    const nodes = root.querySelectorAll<HTMLElement>('[data-card-id]')
    nodes.forEach((n) => obs.observe(n))
    return () => obs.disconnect()
  }, [items, onCardSeen])

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        No news yet — run the ingest worker.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-[100dvh] w-full snap-y snap-mandatory overflow-y-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      {items.map((c) => (
        <div key={c.id} data-card-id={c.id} className="h-[100dvh] w-full">
          <NewsReelCard card={c} />
        </div>
      ))}
    </div>
  )
}
