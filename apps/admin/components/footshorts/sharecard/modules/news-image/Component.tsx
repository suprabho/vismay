'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { useFootshortsNews } from '../dataContext'
import { proxiedImage } from '../shared'
import type { FsCardNewsImageConfig } from '../types'

/**
 * `fscard:news-image` — a news photo with the publisher + headline captioned over
 * a bottom gradient (the caption now lives in the module, so the layer is
 * self-contained). Resolves the article from the injected news list by id.
 */
export default function NewsImageCardComponent({
  config,
  noteReady,
}: VizRenderProps<FsCardNewsImageConfig>) {
  const news = useFootshortsNews()
  const item = news.find((n) => n.id === config.newsId) ?? null

  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  if (!item) return null

  return (
    <>
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxiedImage(item.image_url)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-surface" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-3 pt-10">
        {item.publisher ? (
          <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-white/70">
            {item.publisher}
          </div>
        ) : null}
        <div className="text-[19px] font-bold leading-tight text-white">{item.headline}</div>
      </div>
    </>
  )
}
