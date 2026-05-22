'use client'

import type { ResolvedUnit } from '@vismay/viz-engine'

interface Props {
  slug: string
  /** Full vizmaya-fyi base URL (e.g. `http://localhost:3000`). */
  publicSiteUrl: string
  /** Stable id matching the canvas-frame route's expectation. */
  sectionId: string
  unit: ResolvedUnit
  index: number
  focused: boolean
}

/**
 * Figma-style frame. Label and category tag sit ABOVE the rectangle; the
 * inner box is the output — pure render, no internal chrome.
 *
 * Focused frames embed vizmaya-fyi's single-section render route in an
 * iframe. The iframe IS the section's viewport — its `window`,
 * `matchMedia`, and `@media` rules respond to the iframe's dimensions,
 * which is what makes "resizing the frame behaves like resizing the
 * viewport" work without rewriting the engine's media queries.
 *
 * Inputs feeding this frame (content / config / chart / share / report)
 * live as separate <InputNode>s rendered by <CanvasClient> and wired in
 * by <CanvasWires>.
 */
export default function CanvasFrame({
  slug,
  publicSiteUrl,
  sectionId,
  unit,
  index,
  focused,
}: Props) {
  const kind = (unit.parentConfig.kind ?? 'text').toUpperCase()
  const heading =
    unit.heading ||
    unit.paragraphs[0]?.replace(/\*+/g, '') ||
    `Section ${index + 1}`

  const iframeSrc = `${publicSiteUrl.replace(/\/$/, '')}/story/${encodeURIComponent(
    slug
  )}/canvas-frame/${encodeURIComponent(sectionId)}`

  return (
    <>
      {/* Label row — outside the rectangle. */}
      <div
        style={{
          position: 'absolute',
          left: 4,
          right: 4,
          top: -28,
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
            fontSize: 14,
            fontWeight: 500,
            color: focused ? '#fff' : '#ddd',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {heading}
        </span>
        <span
          style={{
            fontSize: 10,
            color: '#777',
            letterSpacing: '0.14em',
            whiteSpace: 'nowrap',
          }}
        >
          §{index + 1} · {kind}
        </span>
      </div>

      {/* Frame body — iframe when focused, placeholder otherwise. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#0a0a0a',
          border: `1px solid ${focused ? '#888' : '#262626'}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {focused ? (
          <iframe
            // Key includes sectionId so focus changes remount the iframe
            // (releases the previous Mapbox WebGL context cleanly).
            key={sectionId}
            src={iframeSrc}
            title={`section preview · ${sectionId}`}
            style={{
              width: '100%',
              height: '100%',
              border: 0,
              display: 'block',
              background: '#0a0a0a',
            }}
            // No sandbox — vizmaya-fyi pages need full JS + WebGL + cookies
            // for Mapbox and chart modules to work. Cross-origin is fine
            // because the iframe parent doesn't need DOM access into it.
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#333',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            section preview
          </div>
        )}
      </div>
    </>
  )
}
