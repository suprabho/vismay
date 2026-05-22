'use client'

import { Theme } from '@vismay/viz-engine'
import { ReactNode, useMemo } from 'react'
import { ChartColorsProvider, themeToChartColors } from '@vismay/viz-engine'
import type { StatColor } from '@vismay/viz-engine'

/**
 * Admin copy of vizmaya-fyi's ThemeProvider. Same CSS variable + chart-colors
 * wiring as the public site, but the wrapping div fills its parent box
 * (`width/height: 100%`) instead of asserting `minHeight: 100vh` — the
 * provider needs to sit inside a 480x320 canvas frame, not blow it out to
 * viewport height.
 *
 * Eventually this should move into a shared package once admin and
 * vizmaya-fyi both consume it; duplicated here for now to keep the canvas
 * iteration loop unblocked.
 */
export function statColorVar(token?: StatColor): string {
  return `var(--color-${token ?? 'accent2'})`
}

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
          width: '100%',
          height: '100%',
          position: 'relative',
        } as React.CSSProperties}
      >
        {children}
      </div>
    </ChartColorsProvider>
  )
}
