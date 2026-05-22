'use client'

export interface OutputNodeData {
  id: string
  label: string
  tag: string
  /** Full iframe URL (vizmaya-fyi route + query). */
  src: string
  /** Native canvas-space dimensions — what's visible IS what would be
   *  exported. The iframe renders at exactly w×h. */
  w: number
  h: number
}

/**
 * Diagram output node. Mirrors <InputNode>'s label-above-frame language —
 * nothing inside the rectangle but the live render. Iframe content is
 * pointer-events: none so canvas pan / drag still works through it; this is
 * a preview surface, not an interactive embed.
 */
export default function OutputNode({ data }: { data: OutputNodeData }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 4,
          right: 4,
          top: -26,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 16,
          fontFamily: 'system-ui, sans-serif',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: '#ddd',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {data.label}
        </span>
        <span
          style={{
            fontSize: 10,
            color: '#777',
            letterSpacing: '0.14em',
            whiteSpace: 'nowrap',
          }}
        >
          {data.tag}
        </span>
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#0a0a0a',
          border: '1px solid #262626',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <iframe
          // Remount when src changes (focus → different section) so the
          // previous Mapbox WebGL context is released cleanly.
          key={data.src}
          src={data.src}
          title={data.label}
          width={data.w}
          height={data.h}
          style={{
            width: '100%',
            height: '100%',
            border: 0,
            display: 'block',
            background: '#0a0a0a',
            pointerEvents: 'none',
          }}
        />
      </div>
    </>
  )
}
