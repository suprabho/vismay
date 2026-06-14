import type { Theme } from '@vismay/viz-engine'

/**
 * footshorts brand type families, per the footshorts design system's
 * `type-display` guideline:
 *   - Forum      — editorial display serif (headlines / big stats)
 *   - Manrope    — UI / body
 *   - Space Mono — numbers, scores, timers, @handles
 */
const FOOTSHORTS_BRAND_FONTS: Theme['fonts'] = {
  serif: 'Forum',
  sans: 'Manrope',
  mono: 'Space Mono',
}

/**
 * Resolve the theme used to drive a story's **share cards**, swapping in the
 * vertical's brand type families while keeping the story's own colours.
 *
 * Keying off the vertical (not each story's `theme.fonts`) means every
 * footshorts share card is on-brand — filesystem- or DB-backed, current or
 * future — without per-story edits. Non-footshorts verticals pass through
 * unchanged. The `.share-display` tracking treatment and the dropped Vizmaya
 * wordmark are scoped to footshorts the same way (`[data-vertical]`).
 */
export function applyShareBrandFonts(theme: Theme, vertical?: string): Theme {
  if (vertical !== 'footshorts') return theme
  return { ...theme, fonts: FOOTSHORTS_BRAND_FONTS }
}
