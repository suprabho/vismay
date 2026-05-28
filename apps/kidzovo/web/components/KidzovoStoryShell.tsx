'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ForegroundLayoutSlot,
  resolveSlots,
  StoryShellProvider,
  ForegroundContentProvider,
  type ResolvedUnit,
  type StoryDefaults,
} from '@vismay/viz-engine'

/**
 * Kidzovo's lean story shell.
 *
 * Replaces vizmaya-fyi's `StoryMapShell` for the kidzovo path. Kidzovo
 * stories never use Mapbox (`map.opacity: 0.0` in every section), never
 * use charts, and don't need mobile-portrait unit splits — so we skip
 * `BackgroundVizSlot`, `ChartPanel`, and the legacy flat-foreground
 * branch entirely. What's left:
 *
 *   1. A snap-scrolling container with one h-svh section per unit. The
 *      sections are empty divs — region-mode foreground (kz-storybook)
 *      carries all the visible content via ForegroundLayoutSlot.
 *   2. IntersectionObserver to track which unit is centered. Drives
 *      `activeUnit`, which selects which section's foreground renders.
 *   3. A fixed-position ForegroundLayoutSlot that paints the active
 *      panel's background + caption + stage + bubbles. Re-mounts as
 *      `activeUnit` changes because each unit's foreground is its own
 *      stack of layers.
 *
 * About 100 lines vs StoryMapShell's 304. The deletion is honest — these
 * are features the vertical genuinely doesn't use.
 */
export default function KidzovoStoryShell({
  units,
  slug,
  defaults,
}: {
  units: ResolvedUnit[]
  slug: string
  defaults: StoryDefaults
}) {
  const [activeUnit, setActiveUnit] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])

  // IntersectionObserver inside the scroll container — picks whichever
  // snap-section the viewport centers on as the active unit.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Prefer the most-visible entry on each batch.
        let best: IntersectionObserverEntry | null = null
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          if (!best || entry.intersectionRatio > best.intersectionRatio) {
            best = entry
          }
        }
        if (!best) return
        const idx = Number((best.target as HTMLElement).dataset.unitIndex)
        if (!Number.isNaN(idx)) setActiveUnit(idx)
      },
      { root: container, threshold: [0.4, 0.6, 0.8] }
    )

    sectionRefs.current.forEach((el) => {
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [units.length])

  const current = units[activeUnit]
  const currentForeground = current
    ? resolveSlots(current.parentConfig).foreground
    : null
  const showRegions =
    currentForeground != null && currentForeground.kind === 'regions' && current != null

  return (
    <StoryShellProvider
      value={{
        accessToken: '',
        defaults,
        mapOverrides: null,
        isAutoplay: false,
        isPortrait: false,
        isCapture: false,
        units,
      }}
    >
      <div
        ref={containerRef}
        className="h-svh w-full overflow-y-scroll snap-y snap-mandatory"
      >
        {units.map((_, i) => (
          <section
            key={i}
            ref={(el) => {
              sectionRefs.current[i] = el
            }}
            data-unit-index={i}
            className="snap-start snap-always h-svh w-full"
          />
        ))}
      </div>

      {showRegions && current && (
        <div className="fixed inset-0 z-10 pointer-events-none">
          <ForegroundContentProvider value={{ unit: current }}>
            <ForegroundLayoutSlot
              slug={slug}
              foreground={currentForeground}
              unit={current}
              activeStep={0}
              mode="scroll"
              isPortrait={false}
            />
          </ForegroundContentProvider>
        </div>
      )}
    </StoryShellProvider>
  )
}
