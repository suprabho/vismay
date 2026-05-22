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
  Theme,
} from '@vismay/viz-engine'
import ThemeProvider from '@/components/canvas/ThemeProvider'
import VerticalLoader from '@/components/canvas/VerticalLoader'

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
  /**
   * Theme drives the section's typography, colors, and (via
   * `themeToMapPalette` upstream) the default Mapbox style. Without this the
   * preview renders against vizmaya-fyi's stock defaults and looks nothing
   * like the published story.
   */
  theme?: Theme
  /**
   * Vertical bundle (e.g. `'footshort'`, `'f1'`) registered ahead of time so
   * its viz modules are in the engine registry by the time a section that
   * references them tries to mount.
   */
  vertical?: string
  /**
   * Google Fonts stylesheet URL derived from `theme.fonts`. Rendered as a
   * `<link>`; React 19 hoists it into `<head>` and dedupes across mounts.
   */
  fontImportUrl?: string | null
}

/**
 * Tile-sized renderer for a single section. Synthesizes a one-unit shell
 * context so the regular slot dispatchers think they're rendering a
 * one-section story — every per-unit code path stays exactly as in
 * production, no copies, no forks.
 *
 * When `theme` is provided (the canvas case), wraps the rendered output in
 * `<ThemeProvider>` + `<VerticalLoader>` + the story's font link so the
 * preview matches what the public site emits — typography, color palette,
 * map style, and vertical-specific viz modules all line up.
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
  theme,
  vertical,
  fontImportUrl,
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

  const body = (
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

  // No theme passed — return the bare shell. Used by /canvas-spike where
  // theme isn't wired and visual mismatch with production is acceptable.
  if (!theme) return body

  return (
    <>
      {/* React 19 hoists <link> tags into <head> and dedupes them, so
          repeated mounts of the same font URL across focus changes don't
          create duplicate stylesheets. */}
      {fontImportUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href={fontImportUrl} rel="stylesheet" />
        </>
      )}
      <ThemeProvider theme={theme}>
        <VerticalLoader vertical={vertical}>{body}</VerticalLoader>
      </ThemeProvider>
    </>
  )
}
