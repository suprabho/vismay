import type { StorySectionConfig } from './storyConfig.types'

/**
 * Pure scroll math for `clock: 'scrubbed'` runway sections (M3).
 *
 * A scrubbed section renders `runway` viewports tall in live scroll; the
 * reader's progress through that runway IS the beat-local timeline position.
 * These helpers are the single source of truth shared by StoryShell (the
 * scroll listener + IntersectionObserver skip-list) and MapStorySection (the
 * section geometry), so the three can never disagree about which units are
 * runways. See docs/stage-timeline-and-section-transitions.md.
 */

/** Default runway (viewports) when `clock: scrubbed` omits `runway`. */
export const DEFAULT_RUNWAY = 2

/** The section's runway in viewports, or null when it is not scrubbed. */
export function sectionRunway(
  cfg: Pick<StorySectionConfig, 'clock' | 'runway'> | undefined
): number | null {
  if (cfg?.clock !== 'scrubbed') return null
  return cfg.runway ?? DEFAULT_RUNWAY
}

/**
 * Scroll progress 0..1 through a runway section. `sectionTop`/`sectionHeight`
 * are container scroll coordinates (offsetTop / offsetHeight); `viewport` is
 * the container's clientHeight. t = 0 until the section top pins to the
 * scrollport top; t = 1 once its bottom edge pins. Degenerate sections
 * (height <= viewport, e.g. a collapsed runway) report 0 before the top and
 * 1 at/after it so consumers still settle.
 */
export function runwayProgress(
  scrollTop: number,
  sectionTop: number,
  sectionHeight: number,
  viewport: number
): number {
  const range = sectionHeight - viewport
  if (range <= 0) return scrollTop >= sectionTop ? 1 : 0
  return Math.max(0, Math.min(1, (scrollTop - sectionTop) / range))
}

/**
 * Active-unit rule for runway sections: the section owns `activeUnit` while
 * its box covers the scrollport centerline. Half-open [top, top + height) so
 * two adjacent runways can never both claim the same scroll position.
 */
export function coversCenterline(
  scrollTop: number,
  sectionTop: number,
  sectionHeight: number,
  viewport: number
): boolean {
  const center = scrollTop + viewport / 2
  return center >= sectionTop && center < sectionTop + sectionHeight
}

/**
 * Inverse of `runwayProgress` — the scrollTop (container coordinates) that
 * puts a runway section at beat-local time `t`. Used by the editor's seek
 * bridge to land scroll position exactly at an arbitrary `t` rather than
 * relying on the forward scroll→t mapping. Degenerate sections (height <=
 * viewport) have no scroll range — any `t` maps to `sectionTop`, matching
 * `runwayProgress`'s own degenerate-collapse rule.
 */
export function scrollTopForRunwayT(
  sectionTop: number,
  sectionHeight: number,
  viewport: number,
  t: number
): number {
  const range = sectionHeight - viewport
  const clampedT = Math.max(0, Math.min(1, t))
  if (range <= 0) return sectionTop
  return sectionTop + clampedT * range
}
