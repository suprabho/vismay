'use client'

import type { Overlay } from './types'

/** Route a remote image through the same-origin proxy so html-to-image can
 *  rasterize it without a cross-origin taint. Data URLs (uploads / generated
 *  images) pass through untouched. */
export function proxiedOverlaySrc(url: string): string {
  if (url.startsWith('data:')) return url
  return `/api/vizmaya/share-cards/proxy-image?url=${encodeURIComponent(url)}`
}

/**
 * Display-only overlay layer rendered INSIDE the card's capture node, so emojis
 * and placed images are part of the exported PNG. Drag/resize is handled by the
 * editor over the (separate) preview interaction layer. `cardWidth` is the
 * card's render width in px, used to size emoji glyphs relative to the card.
 */
export default function OverlayLayer({
  overlays,
  cardWidth,
}: {
  overlays: Overlay[]
  cardWidth: number
}) {
  if (overlays.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      {overlays.map((o) =>
        o.kind === 'emoji' ? (
          <span
            key={o.id}
            className="absolute"
            style={{
              left: `${o.xPct}%`,
              top: `${o.yPct}%`,
              transform: 'translate(-50%, -50%)',
              // widthPct of card width drives the glyph size (px so it survives
              // html-to-image's clone, which doesn't resolve container units).
              fontSize: (o.widthPct / 100) * cardWidth,
              lineHeight: 1,
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))',
            }}
          >
            {o.text}
          </span>
        ) : o.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={o.id}
            src={proxiedOverlaySrc(o.url)}
            alt=""
            className="absolute object-contain"
            style={{
              left: `${o.xPct}%`,
              top: `${o.yPct}%`,
              width: `${o.widthPct}%`,
              transform: 'translate(-50%, -50%)',
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))',
            }}
          />
        ) : null,
      )}
    </div>
  )
}
