'use client'

import { useState } from 'react'
import type {
  MapOverrideConfig,
  ResolvedUnit,
  StoryDefaults,
} from '@vismay/viz-engine'
import SectionPreview, { type SectionPreviewMode } from './SectionPreview'

interface Props {
  slug: string
  units: ResolvedUnit[]
  defaults: StoryDefaults
  mapOverrides: MapOverrideConfig | null | undefined
  accessToken: string
}

const TILE_W = 480
const TILE_H = 320

/**
 * Three-tile spike for the canvas editor.
 *
 *   A — foreground only, live (no map; cheap; should scale freely)
 *   B — foreground + background, live, tile-scoped (one Mapbox per tile;
 *       the load-bearing test for the canvas direction)
 *   C — snapshot placeholder (stands in for the cached-image path we'd
 *       wire later for off-focus tiles)
 *
 * No drag, no zoom, no inspector. The point is to answer: does the
 * engine isolate cleanly enough to put N sections on one page?
 */
export default function CanvasSpikeClient({
  slug,
  units,
  defaults,
  mapOverrides,
  accessToken,
}: Props) {
  // Pick the first unit that actually has something to render. Stat/hero
  // sections without a foreground are valid spike targets too, but a section
  // with a foreground exercises more code paths.
  const initialIndex = Math.max(
    0,
    units.findIndex((u) => u.parentConfig.chart || u.parentConfig.foreground)
  )
  const [unitIndex, setUnitIndex] = useState(
    initialIndex === -1 ? 0 : initialIndex
  )

  const unit = units[unitIndex]

  const tiles: { label: string; mode: SectionPreviewMode }[] = [
    { label: 'A — foreground only', mode: 'foreground-only' },
    { label: 'B — live (foreground + background)', mode: 'live' },
    { label: 'C — snapshot placeholder', mode: 'placeholder' },
  ]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#ccc',
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
      }}
    >
      <header style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          Canvas spike — {slug}
        </h1>
        <span style={{ fontSize: 12, color: '#888' }}>
          {units.length} units · showing #{unitIndex}
          {unit?.parentConfig.id ? ` (${unit.parentConfig.id})` : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => setUnitIndex((i) => Math.max(0, i - 1))}
            disabled={unitIndex === 0}
            style={btnStyle}
          >
            ← prev
          </button>
          <button
            onClick={() => setUnitIndex((i) => Math.min(units.length - 1, i + 1))}
            disabled={unitIndex >= units.length - 1}
            style={btnStyle}
          >
            next →
          </button>
        </div>
      </header>

      {!unit && <p style={{ color: '#888' }}>No units to render.</p>}

      {unit && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {tiles.map((t) => (
            <div key={t.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: '#888' }}>{t.label}</div>
              <div
                style={{
                  width: TILE_W,
                  height: TILE_H,
                  border: '1px solid #333',
                  borderRadius: 6,
                  background: '#111',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <SectionPreview
                  slug={slug}
                  unit={unit}
                  accessToken={accessToken}
                  defaults={defaults}
                  mapOverrides={mapOverrides}
                  mode={t.mode}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <footer style={{ marginTop: 24, fontSize: 11, color: '#666' }}>
        Each tile mounts a one-unit story shell so the regular slot
        dispatchers think they&apos;re rendering a one-section story.
      </footer>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: '#1a1a1a',
  color: '#ccc',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
}
