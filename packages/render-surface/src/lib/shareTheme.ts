import type { Theme } from '@vismay/viz-engine'
import { appSlugForVertical, APP_BY_SLUG } from '@vismay/verticals/data'

/**
 * Resolve the theme used to drive a story's **share cards**, swapping in the
 * owning app's brand type families while keeping the story's own colours.
 *
 * Registry-driven: the vertical resolves to an app (`appSlugForVertical`), and
 * the app's `branding.brandFonts` (if set) replaces `theme.fonts`. Keying off
 * the vertical — not each story's `theme.fonts` — means every share card under
 * a branded app is on-brand (filesystem- or DB-backed, current or future)
 * without per-story edits. Apps with no `brandFonts` pass through unchanged.
 *
 * Previously this hardcoded footshorts → Forum / Manrope / Space Mono; that
 * mapping now lives on the footshorts app entry in `@vismay/verticals`, so the
 * helper is generic and any future branded app gets the same treatment for
 * free.
 */
export function applyShareBrandFonts(theme: Theme, vertical?: string): Theme {
  const slug = appSlugForVertical(vertical)
  const brandFonts = APP_BY_SLUG.get(slug)?.branding.brandFonts
  if (!brandFonts) return theme
  return { ...theme, fonts: { ...theme.fonts, ...brandFonts } }
}
