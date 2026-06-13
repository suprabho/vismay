'use client'

import {
  Fragment,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { StoryCard } from './StoryCard'
import type { StoryGridItem } from './types'

/** Context handed to a custom card renderer. */
export interface RenderCardContext {
  big: boolean
  /** Index of this card within the flat `items` array. */
  index: number
}

export interface StoryBentoGridProps {
  items: StoryGridItem[]
  /**
   * `carousel` (default) paginates into swipeable pages with dots + arrows —
   * the live vizmaya.fyi look. `stacked` shows every page in a vertical column
   * so all cards are visible at once (used by the admin drag-reorder grid).
   */
  mode?: 'carousel' | 'stacked'
  /** Default card link prefix (cards link to `${hrefBase}${slug}`). */
  hrefBase?: string
  /** Link component for default cards when `hrefBase` is set (e.g. next/link). */
  linkComponent?: ElementType
  /** Override card rendering — e.g. draggable admin cards with an overlay. */
  renderCard?: (item: StoryGridItem, ctx: RenderCardContext) => ReactNode
  /** Controlled page index (carousel mode). */
  page?: number
  onPageChange?: (page: number) => void
  archiveHref?: string
  archiveLabel?: string
  /** Extra classes appended to the `.vzg` wrapper. */
  className?: string
}

/* Chunk the flat list into bento pages: slices of 4 then 5 (matching the live
   grid). Each slide also carries its starting offset so cards can report their
   global index. A slide of exactly 4 cards renders the asymmetric `.four` bento. */
function buildSlides(items: StoryGridItem[]) {
  const out: { items: StoryGridItem[]; offset: number }[] = []
  if (items.length) {
    out.push({ items: items.slice(0, 4), offset: 0 })
    for (let i = 4; i < items.length; i += 5) out.push({ items: items.slice(i, i + 5), offset: i })
  } else {
    out.push({ items: [], offset: 0 })
  }
  return out
}

export function StoryBentoGrid({
  items,
  mode = 'carousel',
  hrefBase,
  linkComponent,
  renderCard,
  page: controlledPage,
  onPageChange,
  archiveHref,
  archiveLabel,
  className = '',
}: StoryBentoGridProps) {
  const slides = buildSlides(items)
  const total = slides.length
  const stacked = mode === 'stacked'

  const [internalPage, setInternalPage] = useState(0)
  const rawPage = controlledPage ?? internalPage
  const cur = Math.min(rawPage, total - 1)
  const setPage = (p: number) => {
    const next = Math.min(total - 1, Math.max(0, p))
    onPageChange?.(next)
    if (controlledPage === undefined) setInternalPage(next)
  }
  const go = (d: number) => setPage(cur + d)

  // Touch-swipe paging — only acts on a clearly horizontal flick so it never
  // hijacks vertical page scroll.
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: ReactTouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: ReactTouchEvent) => {
    if (!touchStart.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1)
    touchStart.current = null
  }

  const render =
    renderCard ??
    ((item: StoryGridItem, ctx: RenderCardContext) => (
      <StoryCard
        data={item.data}
        n={item.n}
        big={ctx.big}
        href={hrefBase ? `${hrefBase}${item.data.slug}` : undefined}
        linkComponent={linkComponent}
      />
    ))

  return (
    <div className={`vzg${stacked ? ' stacked' : ''}${className ? ` ${className}` : ''}`}>
      <div className="carousel">
        <div className="carousel-vp" onTouchStart={stacked ? undefined : onTouchStart} onTouchEnd={stacked ? undefined : onTouchEnd}>
          <div
            className="carousel-track"
            style={stacked ? undefined : { width: `${total * 100}%`, transform: `translateX(-${cur * (100 / total)}%)` }}
          >
            {slides.map((sl, si) => {
              const four = sl.items.length === 4
              return (
                <div className="carousel-slide" key={si} style={stacked ? undefined : { width: `${100 / total}%` }}>
                  <div className={'bento-slide' + (four ? ' four' : '')}>
                    {sl.items.map((it, idx) => (
                      <Fragment key={it.data.slug}>
                        {render(it, { big: four ? idx === 0 : idx < 2, index: sl.offset + idx })}
                      </Fragment>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        {!stacked && (
          <div className="carousel-ctrl">
            <div className="carousel-dots">
              {slides.map((_, si) => (
                <button
                  key={si}
                  type="button"
                  className={'cdot' + (si === cur ? ' on' : '')}
                  onClick={() => setPage(si)}
                  aria-label={`Page ${si + 1}`}
                />
              ))}
            </div>
            <div className="carousel-nav">
              {archiveHref && (
                <a className="carousel-all" href={archiveHref}>
                  {archiveLabel}
                </a>
              )}
              <button type="button" className="carr" onClick={() => go(-1)} disabled={cur === 0} aria-label="Previous">
                ‹
              </button>
              <span className="carousel-count">
                {String(cur + 1).padStart(2, '0')} <i>/</i> {String(total).padStart(2, '0')}
              </span>
              <button type="button" className="carr" onClick={() => go(1)} disabled={cur === total - 1} aria-label="Next">
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default StoryBentoGrid
