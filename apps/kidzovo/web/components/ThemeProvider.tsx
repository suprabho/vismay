'use client'

import type { ReactNode } from 'react'
import type { Theme } from '@vismay/viz-engine'

/**
 * Per-story theme CSS-variable injection. Reads the story's frontmatter
 * `theme:` block and emits the variables consumed by the kidzovo modules
 * (`var(--color-accent)`, `var(--font-serif)`, etc.).
 *
 * Ported from `apps/vizmaya-fyi/components/story/ThemeProvider.tsx` and
 * trimmed: kidzovo doesn't render charts, so `ChartColorsProvider` and the
 * chrome-color tokens it emits are dropped. Stat/positive/amber/red tokens
 * are kept so a future stat-style caption works.
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
  const vars: Record<string, string> = {
    '--color-bg': theme.colors.background,
    '--color-bg-rgb': hexToRgbTriple(theme.colors.background),
    '--color-text': theme.colors.text,
    '--color-accent': theme.colors.accent,
    '--color-accent2': theme.colors.accent2,
    '--color-surface': theme.colors.surface,
    '--color-muted': theme.colors.muted,
    '--color-line': theme.colors.line ?? 'rgba(0,0,0,0.12)',
    '--color-panel-rgb': hexToRgbTriple(theme.colors.surface),
    '--font-serif': `${theme.fonts.serif}, 'Times New Roman', serif`,
    '--font-sans': `${theme.fonts.sans}, -apple-system, 'Segoe UI', Helvetica, sans-serif`,
    '--font-mono': `${theme.fonts.mono}, 'Courier New', Consolas, monospace`,
  }
  if (theme.colors.teal) vars['--color-teal'] = theme.colors.teal
  if (theme.colors.positive) vars['--color-positive'] = theme.colors.positive
  if (theme.colors.amber) vars['--color-amber'] = theme.colors.amber
  if (theme.colors.red) vars['--color-red'] = theme.colors.red

  return (
    <div
      style={
        {
          ...vars,
          background: theme.colors.background,
          color: theme.colors.text,
          fontFamily: vars['--font-sans'],
          minHeight: '100vh',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
