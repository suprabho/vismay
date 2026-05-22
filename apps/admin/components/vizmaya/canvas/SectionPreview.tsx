'use client'

import { useMemo } from 'react'
import {
  BackgroundVizSlot,
  ForegroundLayoutSlot,
  StoryShellProvider,
  resolveSlots,
} from '@vismay/viz-engine'
import type {
  MapOverrideConfig,
  ResolvedUnit,
  StoryDefaults,
} from '@vismay/viz-engine'

export type SectionPreviewMode =
  /** Mount only the foreground stack — no map, no Mapbox WebGL context. */
  | 'foreground-only'
  /** Mount background + foreground, tile-scoped so backgrounds don't go viewport-fixed. */
  | 'live'
  /** Render nothing but a labeled placeholder box — stands in for a cached snapshot. */
  | 'placeholder'

interface Props {
  slug: string
  /** The one section to render. Treated as a story-of-one for the shell context. */
  unit: ResolvedUnit
  accessToken: string
  defaults: StoryDefaults
  mapOverrides: MapOverrideConfig | null | undefined
  mode: SectionPreviewMode
}

/**
 * Tile-sized renderer for a single section. Synthesizes a one-unit shell
 * context so the regular slot dispatchers think they're rendering a
 * one-section story — every per-unit code path stays exactly as in
 * production, no copies, no forks.
 *
 * The tile is `position: relative` so the background slot (when mode='live')
 * paints into THIS box instead of going viewport-fixed.
 */
export default function SectionPreview({
  slug,
  unit,
  accessToken,
  defaults,
  mapOverrides,
  mode,
}: Props) {
  const foreground = useMemo(
    () => resolveSlots(unit.parentConfig).foreground,
    [unit]
  )

  if (mode === 'placeholder') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background:
            'repeating-linear-gradient(45deg, #1a1a1a, #1a1a1a 8px, #222 8px, #222 16px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 11,
        }}
      >
        snapshot placeholder
      </div>
    )
  }

  return (
    <StoryShellProvider
      value={{
        accessToken,
        defaults,
        mapOverrides,
        isAutoplay: false,
        isPortrait: false,
        isCapture: false,
        units: [unit],
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        {mode === 'live' && (
          <BackgroundVizSlot
            slug={slug}
            units={[unit]}
            activeUnit={0}
            mode="scroll"
            containerMode="tile"
          />
        )}
        <ForegroundLayoutSlot
          slug={slug}
          foreground={foreground}
          unit={unit}
          activeStep={unit.subIndex}
          mode="scroll"
          isPortrait={false}
        />
      </div>
    </StoryShellProvider>
  )
}
