import type { CSSProperties } from 'react'
import type { Theme } from '@vismay/viz-engine'

/* Each story/epic card renders in its own theme — a dark base with an accent
   glow, and the theme's own typefaces. */
export interface CardTheme {
  bg: string
  text: string
  muted: string
  accent: string
  serif?: string
  sans?: string
  mono?: string
}

export function withFallback(
  name: string | undefined,
  kind: 'serif' | 'sans' | 'mono'
): string | undefined {
  if (!name) return undefined
  if (kind === 'serif') return `${name}, Georgia, serif`
  if (kind === 'sans') return `${name}, -apple-system, 'Segoe UI', Helvetica, sans-serif`
  return `${name}, 'Courier New', monospace`
}

/* Stories carry a full viz-engine Theme (colors + fonts). */
export function storyCardTheme(theme: Theme): CardTheme {
  return {
    bg: theme.colors.background,
    text: theme.colors.text,
    muted: theme.colors.muted,
    accent: theme.colors.accent,
    serif: withFallback(theme.fonts.serif, 'serif'),
    sans: withFallback(theme.fonts.sans, 'sans'),
    mono: withFallback(theme.fonts.mono, 'mono'),
  }
}

/* Brand tricolor, cycled across epics whose theme has no accent of its own. */
export const EPIC_ACCENTS = ['#0BBFAB', '#E84D7A', '#2B4ACF']

/* Epic themes are a loose, often-sparse jsonb (`ink`/`surface`/`accent`/
   `bone`/`fonts`); fall back to the brand tricolor + a dark base when absent.
   Epstein's theme uses `ember` (not `accent`) as its primary accent key, so
   we check that too before reaching for the EPIC_ACCENTS fallback. */
export function epicCardTheme(
  raw: Record<string, unknown> | undefined,
  index: number
): CardTheme {
  const t = (raw ?? {}) as {
    ink?: string
    surface?: string
    bone?: string
    muted?: string
    accent?: string
    ember?: string // Epstein primary accent
    fonts?: { serif?: string; sans?: string; mono?: string }
  }
  const fonts = t.fonts ?? {}
  return {
    bg: t.ink || t.surface || '#0C0C10',
    text: t.bone || '#FFFFFF',
    muted: t.muted || 'rgba(255,255,255,.7)',
    accent: t.accent || t.ember || EPIC_ACCENTS[index % EPIC_ACCENTS.length],
    serif: withFallback(fonts.serif, 'serif'),
    sans: withFallback(fonts.sans, 'sans'),
    mono: withFallback(fonts.mono, 'mono'),
  }
}

/* Inline CSS custom properties + dark gradient base for a themed card. */
export function cardThemeStyle(ct: CardTheme, textColor?: string): CSSProperties {
  const text = textColor ?? ct.text
  return {
    ['--bn-bg']: ct.bg,
    ['--bn-text']: text,
    ['--bn-muted']: ct.muted,
    ['--bn-accent']: ct.accent,
    ...(ct.serif ? { ['--bn-serif']: ct.serif } : {}),
    ...(ct.sans ? { ['--bn-sans']: ct.sans } : {}),
    ...(ct.mono ? { ['--bn-mono']: ct.mono } : {}),
    background: ct.bg,
    backgroundImage:
      `radial-gradient(120% 90% at 85% 8%, ${ct.accent}55 0%, ${ct.accent}14 34%, transparent 62%),` +
      `radial-gradient(90% 80% at 8% 100%, ${ct.accent}30 0%, transparent 55%)`,
    color: text,
  } as CSSProperties
}

export const DEFAULT_CARD_THEME: CardTheme = {
  bg: '#0C0C10',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,.7)',
  accent: '#0BBFAB',
}

export const fmtMonth = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
