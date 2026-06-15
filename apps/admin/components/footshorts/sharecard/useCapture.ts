'use client'

import { useCallback, type RefObject } from 'react'
import { toPng } from 'html-to-image'

/**
 * Rasterize a DOM node to a PNG data URL. Ported from vizmaya-fyi's ShareCard
 * capture: wait for fonts + every `<img>` to finish loading/decoding before
 * snapshotting (html-to-image clones the node and re-fetches each src; an
 * unresolved image rasterizes blank), then `toPng` at the target pixelRatio.
 */
export function useCapture(
  nodeRef: RefObject<HTMLElement | null>,
  opts: { width: number; height: number; pixelRatio: number; backgroundColor?: string },
) {
  const { width, height, pixelRatio, backgroundColor } = opts

  const capture = useCallback(async (): Promise<string | null> => {
    const node = nodeRef.current
    if (!node) return null
    try {
      await document.fonts.ready
      const imgs = Array.from(node.querySelectorAll('img'))
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) {
            return img.decode().catch(() => undefined)
          }
          return new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
        }),
      )
      return await toPng(node, {
        width,
        height,
        pixelRatio,
        backgroundColor: backgroundColor ?? '#0B0B0F',
        // Bypass html-to-image's process-lifetime URL cache. Its cache key strips
        // the query string, so every proxied crest (/api/.../proxy-image?url=...)
        // collides on the same key — the second capture after switching matches
        // would otherwise re-serve the previous match's flags/logos.
        cacheBust: true,
        // Skip any element flagged as capture-only UI (none today; kept for parity).
        filter: (el) =>
          !(el instanceof HTMLElement && el.dataset.shareUi === 'true'),
      })
    } catch (err) {
      console.error('Share card capture failed:', err)
      return null
    }
  }, [nodeRef, width, height, pixelRatio, backgroundColor])

  const download = useCallback(
    async (filename: string): Promise<boolean> => {
      const dataUrl = await capture()
      if (!dataUrl) return false
      const link = document.createElement('a')
      link.download = filename
      link.href = dataUrl
      link.click()
      return true
    },
    [capture],
  )

  return { capture, download }
}
