'use client'

import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { resolveAssetUrl } from '@vismay/viz-engine'
import type { VizRenderProps } from '@vismay/viz-engine'
import { enterStyle } from '../../lib/enter'
import type { PhotoStackLayerConfig } from './index'

/**
 * `travel:photoStack` — fanned polaroid pile. Items render back-to-front so
 * items[0] (the featured photo) paints on top with a full matte + caption;
 * the rest peek out behind at fanned rotations and small offsets.
 */
export default function PhotoStackLayerComponent({
  config,
  noteReady,
}: VizRenderProps<PhotoStackLayerConfig>) {
  const topImgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const img = topImgRef.current
    if (img?.complete) noteReady()
  }, [noteReady])

  const items = config.items
  const spread = config.rotationSpread ?? 6
  const n = items.length

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...enterStyle(config.enterDelay),
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 'min(100%, 92%)',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {[...items].reverse().map((item, revIdx) => {
          const idx = n - 1 - revIdx // original index; 0 = top of pile
          const isTop = idx === 0
          // Fan the pile: back items rotate progressively; top sits nearly straight.
          const t = n > 1 ? idx / (n - 1) : 0
          const rot = (t - 0.5) * spread * (idx % 2 === 0 ? 1 : -1)
          const dx = (t - 0.5) * 6
          const dy = t * -2.5

          const frame: CSSProperties = {
            position: isTop ? 'relative' : 'absolute',
            display: 'flex',
            flexDirection: 'column',
            background: '#fdfcf8',
            padding: isTop ? '3.5% 3.5% 0' : '2.5%',
            borderRadius: 2,
            boxShadow: isTop
              ? '0 12px 30px rgba(20, 16, 8, 0.3)'
              : '0 6px 16px rgba(20, 16, 8, 0.2)',
            transform: `translate(${dx}%, ${dy}%) rotate(${rot}deg)`,
            maxWidth: isTop ? '86%' : '78%',
            maxHeight: isTop ? '92%' : '80%',
          }

          return (
            <figure key={item.src} style={{ ...frame, margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={isTop ? topImgRef : undefined}
                src={resolveAssetUrl(item.src)}
                alt={item.caption ?? ''}
                style={{
                  display: 'block',
                  width: '100%',
                  aspectRatio: '4 / 3',
                  // Shrinkable flex child (see polaroid): lets maxHeight win
                  // over the aspect-ratio height in short slots.
                  flex: '1 1 auto',
                  minHeight: 0,
                  objectFit: 'cover',
                  objectPosition: item.focus ?? 'center',
                  background: '#e9e5da',
                }}
                loading="lazy"
                decoding="async"
                onLoad={isTop ? () => noteReady() : undefined}
                onError={isTop ? () => noteReady() : undefined}
                draggable={false}
              />
              {isTop && (
                <figcaption
                  style={{
                    minHeight: '2.2em',
                    flexShrink: 0,
                    padding: '0.5em 0.2em 0.6em',
                    fontFamily: "'Caveat', 'Segoe Script', 'Bradley Hand', cursive",
                    fontSize: 'clamp(13px, 2vmin, 20px)',
                    lineHeight: 1.25,
                    color: '#42392c',
                    textAlign: 'center',
                  }}
                >
                  {item.caption ?? ''}
                </figcaption>
              )}
            </figure>
          )
        })}

        {config.moreCount != null && (
          <a
            href={config.moreHref ?? '#'}
            style={{
              position: 'absolute',
              right: '2%',
              bottom: '4%',
              background: '#2b2419',
              color: '#fffdf8',
              fontFamily: "'Space Mono', ui-monospace, monospace",
              fontSize: '0.68em',
              letterSpacing: '0.08em',
              padding: '0.5em 0.9em',
              borderRadius: 999,
              textDecoration: 'none',
              transform: 'rotate(-2deg)',
              boxShadow: '0 4px 12px rgba(20, 16, 8, 0.3)',
              pointerEvents: 'auto',
            }}
          >
            + {config.moreCount} more ↗
          </a>
        )}
      </div>
    </div>
  )
}
