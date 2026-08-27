'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { useFootshortsNews } from '../dataContext'
import type { FsCardNewsArticleConfig } from '../types'

/** `fscard:news-article` — a text-only editorial card (publisher / headline /
 *  summary). Reproduces ShareCardCanvas's NewsArticleBody. */
export default function NewsArticleCardComponent({
  config,
  noteReady,
}: VizRenderProps<FsCardNewsArticleConfig>) {
  const news = useFootshortsNews()
  const item = news.find((n) => n.id === config.newsId) ?? null

  useEffect(() => {
    if (!item) return
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [item, noteReady])

  if (!item) return null

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3 px-5">
      {item.publisher ? (
        <div className="text-[13px] font-bold uppercase tracking-[1.4px] text-accent">
          {item.publisher}
        </div>
      ) : null}
      <div className="text-[26px] font-extrabold leading-[1.15] text-text">{item.headline}</div>
      {item.summary ? (
        <p className="line-clamp-6 text-[15px] leading-relaxed text-muted">{item.summary}</p>
      ) : null}
    </div>
  )
}
