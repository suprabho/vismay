import type { CSSProperties } from 'react'
import { themes, themeToVars, type ThemeName } from '@footshorts/brand'

/** "#RRGGBB" / "#RGB" → "R G B" channels for the `--sf-color-*` runtime vars. */
export function hexToChannels(hex: string): string | null {
  const h = hex.trim().replace(/^#/, '')
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h)) return null
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(full, 16)
  return `${(n >> 16) & 0xff} ${(n >> 8) & 0xff} ${n & 0xff}`
}

/**
 * CSS vars for a themed preview surface. Sets the `--sf-color-*` runtime vars
 * (which admin's `@theme inline` maps to `--color-*` and the `bg-*`/`text-*`
 * Tailwind tokens the viz components use). When `accent` is a valid hex it
 * overrides `--sf-color-accent` — the lever leagues use to recolor competition
 * accents, bracket highlights, and card borders. `--color-line` isn't in the
 * `@theme` map, so we set it explicitly from the theme border for the chart grid.
 */
export function themeStyleVars(name: ThemeName, accent?: string | null): CSSProperties {
  const theme = themes[name]
  const vars = themeToVars(theme) as Record<string, string>
  if (accent) {
    const channels = hexToChannels(accent)
    if (channels) vars['--sf-color-accent'] = channels
  }
  const borderChannels = hexToChannels(theme.colors.border)
  if (borderChannels) vars['--color-line'] = `rgb(${borderChannels})`
  return vars as CSSProperties
}

export const THEME_NAMES: ThemeName[] = ['classic', 'pitch', 'terrace']

export const THEME_LABELS: Record<ThemeName, string> = {
  classic: 'Classic',
  pitch: 'Pitch',
  terrace: 'Terrace',
}
