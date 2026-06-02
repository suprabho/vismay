'use client'

import { useCallback, useEffect, useRef } from 'react'
import { resolveAssetUrl } from '../../lib/assetUrl'
import type { VizRenderProps } from '../../types'
import type { ImageGridLayerConfig } from './index'

/**
 * Number of `<img>` settles (load or error) required before this grid signals
 * ready to the readiness coordinator. Keyed by item count.
 */
function gridTemplate(count: number): {
  columns: string
  rows: string
  /** Per-item grid placement, when the grid asymmetric (e.g. 5 = 3+2 split). */
  placements?: string[]
} {
  switch (count) {
    case 2:
      return { columns: '1fr 1fr', rows: '1fr' }
    case 3:
      return { columns: '1fr 1fr 1fr', rows: '1fr' }
    case 4:
      return { columns: '1fr 1fr', rows: '1fr 1fr' }
    case 5:
      return {
        columns: '1fr 1fr 1fr',
        rows: '1fr 1fr',
        // First row: 3 across. Second row: 2 across, centred via spanning.
        placements: [
          '1 / 1 / 2 / 2',
          '1 / 2 / 2 / 3',
          '1 / 3 / 2 / 4',
          '2 / 1 / 3 / 3',
          '2 / 3 / 3 / 4',
        ],
      }
    case 6:
      return { columns: '1fr 1fr 1fr', rows: '1fr 1fr' }
    default:
      return { columns: '1fr', rows: '1fr' }
  }
}

export default function ImageGridLayerComponent({
  config,
  noteReady,
}: VizRenderProps<ImageGridLayerConfig>) {
  const settled = useRef(0)
  const total = config.items.length
  const signaled = useRef(false)

  // Signal ready once every image has either loaded or errored.
  const noteSettle = useCallback(() => {
    settled.current++
    if (!signaled.current && settled.current >= total) {
      signaled.current = true
      noteReady()
    }
  }, [noteReady, total])

  // Belt-and-braces: if the slot mounts with zero items somehow, signal
  // immediately. (parseConfig already enforces ≥2, but this keeps the
  // readiness coordinator safe under future schema changes.)
  useEffect(() => {
    if (total === 0 && !signaled.current) {
      signaled.current = true
      noteReady()
    }
  }, [noteReady, total])

  const { columns, rows, placements } = gridTemplate(total)

  return (
    <figure
      className="w-full h-full flex flex-col"
      style={{ margin: 0, gap: '0.75rem' }}
    >
      <div
        className="flex-1 grid"
        style={{
          gridTemplateColumns: columns,
          gridTemplateRows: rows,
          gap: '0.5rem',
          minHeight: 0,
        }}
      >
        {config.items.map((item, i) => (
          <ImageCell
            key={`${item.src}-${i}`}
            item={item}
            fit={config.fit ?? 'cover'}
            placement={placements?.[i]}
            onSettle={noteSettle}
          />
        ))}
      </div>
      {config.caption && (
        <figcaption
          className="font-mono text-center"
          style={{
            color: 'var(--color-muted)',
            fontSize: '0.7rem',
            letterSpacing: '0.05em',
          }}
        >
          {config.caption}
        </figcaption>
      )}
    </figure>
  )
}

function ImageCell({
  item,
  fit,
  placement,
  onSettle,
}: {
  item: ImageGridLayerConfig['items'][number]
  fit: 'cover' | 'contain'
  placement?: string
  onSettle: () => void
}) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const settled = useRef(false)

  const fire = useCallback(() => {
    if (settled.current) return
    settled.current = true
    onSettle()
  }, [onSettle])

  // Cached images can settle before React attaches handlers.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete) fire()
  }, [fire])

  return (
    <div
      className="relative overflow-hidden"
      style={{
        gridArea: placement,
        background: 'rgb(var(--color-panel-rgb) / 0.2)',
        borderRadius: '6px',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={resolveAssetUrl(item.src)}
        alt={item.alt ?? ''}
        onLoad={fire}
        onError={fire}
        style={{
          width: '100%',
          height: '100%',
          objectFit: fit,
          display: 'block',
        }}
        draggable={false}
      />
    </div>
  )
}
