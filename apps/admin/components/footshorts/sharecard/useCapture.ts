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
    const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    try {
      await document.fonts.ready
      // The card body renders through the viz-engine registry: each layer
      // Suspense-loads its chunk and resolves its data asynchronously. Snapshotting
      // too early rasterizes a half-built card (the m1 lazy-load race). Give React
      // two frames + a short settle so chunks mount and data resolves, THEN collect
      // images — so a layer added moments ago is captured whole.
      await raf()
      await raf()
      await delay(180)
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
        // Key html-to-image's process-lifetime cache on the FULL url (query string
        // included). By default it strips the query string, so every proxied crest
        // (/api/.../proxy-image?url=...) collides on one key and the first flag
        // fetched gets re-served for the rest — both teams render the same flag.
        // cacheBust can't fix this: the cache is checked before cacheBust touches
        // the fetch url. (cacheBust still defeats the browser HTTP cache.)
        includeQueryParams: true,
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
