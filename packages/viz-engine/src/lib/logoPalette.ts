// Resolves per-section Vizmaya-logo color overrides into concrete palettes the
// `VizmayaLogo` Rive component can apply via `setRgba`. Pure + client-safe (no
// fs/runtime imports) — mirrors the server-side theme→color derivation done by
// `themeToMapPalette` for maps, so the resolved hex values serialize cleanly
// from the story page (server) into the client shell.

import type { Theme } from '../types/story'
import type { LogoPalette, StoryDefaults, StorySectionConfig } from './storyConfig.types'

/** The seven logo slots, in `.riv` view-model binding order. */
const SLOTS = ['text', 'teal', 'accent', 'accent2', 'surface', 'muted', 'line'] as const

/**
 * Resolve a single override value. A `$`-prefixed value is a theme token,
 * resolved against `theme.colors` (may be `undefined` for unset optionals like
 * `line`); anything else is treated as a literal color and passes through.
 * Matches the `$token` convention used by maps/charts/legends.
 */
function resolveColor(value: string | undefined, theme: Theme): string | undefined {
  if (!value) return undefined
  if (!value.startsWith('$')) return value
  return theme.colors[value.slice(1) as keyof Theme['colors']]
}

/** Theme-derived base palette — the colors the logo uses when nothing overrides. */
function basePalette(theme: Theme): LogoPalette {
  return {
    text: theme.colors.text,
    teal: theme.colors.teal,
    accent: theme.colors.accent,
    accent2: theme.colors.accent2,
    surface: theme.colors.surface,
    muted: theme.colors.muted,
    line: theme.colors.line,
  }
}

/** Layer a `$token`/hex override over a resolved base; drop slots that resolve to undefined. */
function applyOverride(base: LogoPalette, override: LogoPalette | undefined, theme: Theme): LogoPalette {
  if (!override) return base
  const out: LogoPalette = { ...base }
  for (const slot of SLOTS) {
    const resolved = resolveColor(override[slot], theme)
    if (resolved !== undefined) out[slot] = resolved
  }
  return out
}

/**
 * One resolved logo palette per `config.sections` entry. The array index is the
 * section's `parentIndex` (see `ResolvedUnit`), so the shell can look up the
 * active section's palette as `palettes[current.parentIndex]`.
 *
 * Cascade per section: theme base → `defaults.logoPalette` → `section.logoPalette`.
 */
export function resolveSectionLogoPalettes(
  theme: Theme,
  defaults: StoryDefaults,
  sections: StorySectionConfig[],
): LogoPalette[] {
  const base = applyOverride(basePalette(theme), defaults.logoPalette, theme)
  return sections.map((section) => applyOverride(base, section.logoPalette, theme))
}
