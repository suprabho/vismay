'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import type { FsCardAiImageConfig } from '../types'

/**
 * `fscard:ai-image` — a bleed AI image with an optional caption over a bottom
 * gradient. The data URL is embedded in the config, so there is nothing to fetch.
 */
export default function AiImageCardComponent({
  config,
  noteReady,
}: VizRenderProps<FsCardAiImageConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  if (!config.dataUrl) return null

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={config.dataUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {config.caption ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-3 pt-10">
          <div className="text-[20px] font-bold leading-tight text-white">{config.caption}</div>
        </div>
      ) : null}
    </>
  )
}
