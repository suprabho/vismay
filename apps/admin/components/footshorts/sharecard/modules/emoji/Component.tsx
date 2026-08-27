'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import type { FsCardEmojiConfig } from '../types'

/**
 * `fscard:emoji` — a native emoji glyph rendered as a free-positioned layer. The
 * composer owns position + size (the transform box); the glyph fills that box via
 * container-query font sizing, so dragging the resize handle scales the emoji.
 * `getComputedStyle` resolves the `cq*` font-size to px, so html-to-image
 * captures it crisply. Stored as text (not an image) so capture needs no proxy.
 */
export default function EmojiCardComponent({ config, noteReady }: VizRenderProps<FsCardEmojiConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  if (!config.glyph) return null

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ containerType: 'size' }}
    >
      <span style={{ fontSize: 'min(100cqw, 100cqh)', lineHeight: 1 }}>{config.glyph}</span>
    </div>
  )
}
