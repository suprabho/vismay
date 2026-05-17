'use client'

import { Theme } from '@vismay/viz-engine'
import { ReactNode, useMemo } from 'react'
import { ChartColorsProvider, themeToChartColors } from '@vismay/viz-engine'
import type { StatColor } from '@vismay/viz-engine'

/**
 * Resolve a stat-panel color token to the CSS variable emitted by the
 * surrounding `ThemeProvider`. Unset → `accent2` (the historical default
 * for non-percentage stats). Centralised so the story renderer and the
 * share-card renderer can't drift apart.
 */
export function statColorVar(token?: StatColor): string {
  return `var(--color-${token ?? 'accent2'})`
}

/**
 * Convert a `#rrggbb` hex color into the space-separated RGB triple expected
 * by `rgb(var(--token) / alpha)`. Falls back to a neutral dark if the input
 * isn't a parseable 6-digit hex.
 */
function hexToRgbTriple(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return '10 14 20'
  const n = parseInt(match[1], 16)
  return `${(n >> 16) & 0xff} ${(n >> 8) & 0xff} ${n & 0xff}`
}

export default function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme
  children: ReactNode
}) {
  const chartColors = useMemo(() => themeToChartColors(theme), [theme])

  const vars: Record<string, string> = {
    '--color-bg': theme.colors.background,
    '--color-bg-rgb': hexToRgbTriple(theme.colors.background),
    '--color-text': theme.colors.text,
    '--color-accent': theme.colors.accent,
    '--color-accent2': theme.colors.accent2,
    '--color-teal': theme.colors.teal,
    '--color-surface': theme.colors.surface,
    '--color-muted': theme.colors.muted,
    '--color-line': chartColors.line,
    // Panel chrome for cards sitting on top of maps / media. Stored as an
    // RGB triple so consumers can compose alpha via `rgb(var(--color-panel-rgb) / 0.x)`.
    '--color-panel-rgb': hexToRgbTriple(theme.colors.surface),
    '--color-chrome-bg': chartColors.chromeBg,
    '--color-chrome-text': chartColors.chromeText,
    '--color-chrome-text-dim': chartColors.chromeTextDim,
    '--color-chrome-text-muted': chartColors.chromeTextMuted,
    '--font-serif': `${theme.fonts.serif}, 'Times New Roman', serif`,
    '--font-sans': `${theme.fonts.sans}, -apple-system, 'Segoe UI', Helvetica, sans-serif`,
    '--font-mono': `${theme.fonts.mono}, 'Courier New', Consolas, monospace`,
  }

  if (theme.colors.positive) vars['--color-positive'] = theme.colors.positive
  if (theme.colors.amber) vars['--color-amber'] = theme.colors.amber
  if (theme.colors.red) vars['--color-red'] = theme.colors.red

  return (
    <ChartColorsProvider value={chartColors}>
      <div
        style={{
          ...vars,
          background: theme.colors.background,
          color: theme.colors.text,
          fontFamily: vars['--font-sans'],
          minHeight: '100vh',
        } as React.CSSProperties}
      >
        {children}
      </div>
    </ChartColorsProvider>
  )
}
