'use client'

import { useMemo } from 'react'
import ForegroundVizSlot from './ForegroundVizSlot'
import { ForegroundContentProvider } from './lib/foregroundContent'
import {
  DEFAULT_FOREGROUND_LAYOUT,
  FLAT_FOREGROUND_LAYOUT,
  getForegroundLayout,
} from './foregroundLayouts'
import type { ResolvedForeground } from './lib/resolveSlots'
import type { ResolvedUnit } from './lib/storyConfig.types'
import type { ForegroundLayoutDef } from './types'

interface ForegroundLayoutSlotProps {
  slug: string
  /** Resolved foreground for the active unit. */
  foreground: ResolvedForeground
  /**
   * Active unit. Threaded through `ForegroundContentProvider` so text-style
   * modules can read `heading`/`paragraphs` without re-parsing markdown.
   * Modules that don't need unit context simply ignore the provider.
   */
  unit: ResolvedUnit
  activeStep: number
  mode: 'scroll' | 'autoplay' | 'capture' | 'print'
  isPortrait?: boolean
  noteLayerReady?: (key: string) => void
}

/**
 * Outer dispatcher for the region-aware foreground.
 *
 * Looks up the layout (`flat` → `single-fill`; `regions` → named layout from
 * the registry), picks the portrait variant when `isPortrait` is true, and
 * mounts one `<ForegroundVizSlot>` per region inside a positioned wrapper
 * driven by the region's `style`.
 *
 * Region wrappers ALWAYS render — even when empty — so that downstream
 * consumers (notably the persistent map mount in Phase 3) can measure region
 * rects via `ResizeObserver` regardless of which layers each region holds.
 *
 * `pointer-events` is `none` on empty regions and on the surrounding fixed
 * wrapper; layer-level styling re-enables pointer events for individual
 * layers as needed (matching the existing `ForegroundVizSlot` behavior).
 */
export default function ForegroundLayoutSlot({
  slug,
  foreground,
  unit,
  activeStep,
  mode,
  isPortrait = false,
  noteLayerReady,
}: ForegroundLayoutSlotProps) {
  const { layoutDef, regions } = useMemo(() => {
    if (foreground.kind === 'flat') {
      const def = getForegroundLayout(FLAT_FOREGROUND_LAYOUT)
      return {
        layoutDef: def ?? null,
        regions: { default: foreground.layers } as Record<string, typeof foreground.layers>,
      }
    }
    const def = getForegroundLayout(foreground.layout)
    if (!def && typeof window !== 'undefined') {
      console.warn(
        `[ForegroundLayoutSlot] unknown layout '${foreground.layout}', falling back to '${DEFAULT_FOREGROUND_LAYOUT}'`
      )
    }
    return {
      layoutDef: def ?? getForegroundLayout(DEFAULT_FOREGROUND_LAYOUT) ?? null,
      regions: foreground.regions,
    }
  }, [foreground])

  if (!layoutDef) return null
  const activeDef: ForegroundLayoutDef = (isPortrait && layoutDef.portrait) || layoutDef
  const unitKey = `${unit.parentIndex}-${unit.subIndex}`

  return (
    <ForegroundContentProvider value={{ unit }}>
      {Object.entries(activeDef.regions).map(([regionName, regionDef]) => {
        const layers = regions[regionName] ?? []
        return (
          <div
            key={regionName}
            data-foreground-region={regionName}
            // Region wrappers are ALWAYS click-through. Without this, the
            // `fixed inset-0 pointer-events-none` parent gets overridden by any
            // child that has `pointer-events: auto` set (CSS pointer-events is
            // not inherited), which causes the region to swallow scroll/wheel
            // events that should pass through to the snap-scroll container
            // behind. Individual layers re-enable pointer events for their own
            // wrappers when they need interactivity (chart hover, embed clicks,
            // map drag) — see `layerWrapperStyle` in ForegroundVizSlot.
            style={{ ...regionDef.style, pointerEvents: 'none' }}
          >
            <ForegroundVizSlot
              slug={slug}
              layers={layers}
              unitKey={`${unitKey}:${regionName}`}
              activeStep={activeStep}
              mode={mode}
              noteLayerReady={noteLayerReady}
            />
          </div>
        )
      })}
    </ForegroundContentProvider>
  )
}
