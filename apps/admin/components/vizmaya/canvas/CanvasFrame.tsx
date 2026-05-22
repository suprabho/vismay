'use client'

import type {
  MapOverrideConfig,
  ResolvedUnit,
  StoryDefaults,
} from '@vismay/viz-engine'
import SectionPreview from './SectionPreview'

interface Props {
  slug: string
  unit: ResolvedUnit
  index: number
  focused: boolean
  accessToken: string
  defaults: StoryDefaults
  mapOverrides: MapOverrideConfig | null | undefined
}

/**
 * Figma-style frame. The label and category tag sit ABOVE the rectangle
 * (positioned with negative top), so the inner box is reserved entirely
 * for the rendered output — no card chrome, no badges intruding on the
 * preview. Matches the Reference / Image Model / Video Model frames in
 * the user's diagram reference.
 *
 * Inputs that feed this frame (content, config, chart, share, report)
 * live as separate <InputNode>s rendered by <CanvasClient> and wired in
 * by <CanvasWires>. The frame itself only knows it's the OUTPUT — the
 * subgraph topology is the canvas's job.
 */
export default function CanvasFrame({
  slug,
  unit,
  index,
  focused,
  accessToken,
  defaults,
  mapOverrides,
}: Props) {
  const kind = (unit.parentConfig.kind ?? 'text').toUpperCase()
  const heading =
    unit.heading || unit.paragraphs[0]?.replace(/\*+/g, '') || `Section ${index + 1}`

  return (
    <>
      {/* Label row — ABOVE the frame, not inside. Renders outside the
          wrapper's geometric box but still inside the click target. */}
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

      {/* Frame body — pure output rectangle. No internal chrome. */}
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
          <SectionPreview
            slug={slug}
            unit={unit}
            accessToken={accessToken}
            defaults={defaults}
            mapOverrides={mapOverrides}
            mode="live"
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
