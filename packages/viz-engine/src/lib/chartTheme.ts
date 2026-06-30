'use client'

import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Theme } from '../types/story'

/**
 * Single source of truth for chart colors. The story's frontmatter
 * `theme.colors` is the actual source — `ThemeProvider` derives a
 * `ChartColors` object from it and publishes it via context. Charts read
 * the palette via `useChartColors()` so swapping a story's theme
 * automatically reflows every chart.
 *
 * Why a hook instead of CSS variables: ECharts option objects need real
 * string values at construction time, not `var(--name)` references.
 */

export const defaultChartColors = {
  accent: '#f54900',
  accent2: '#155dfc',
  teal: '#00d5be',
  green: '#009966',
  amber: '#EF9F27',
  red: '#E24B4A',
  muted: '#aca286',
  line: '#1a2830',
  surface: '#023555',
  // Chart chrome — tooltip surface, label text, dimmed text (treemap tiles
  // that aren't highlighted), and muted caption text. Separate from the
  // palette so stories can later retheme chart UI without touching brand colors.
  chromeBg: '#111820',
  chromeText: '#e0ddd5',
  chromeTextDim: '#8a9a9f',
  chromeTextMuted: '#3a4a50',
} as const

export type ChartColors = { -readonly [K in keyof typeof defaultChartColors]: string }

const ChartColorsContext = createContext<ChartColors>({ ...defaultChartColors })

export const ChartColorsProvider = ChartColorsContext.Provider

export function useChartColors(): ChartColors {
  return useContext(ChartColorsContext)
}

/**
 * Map a story's `theme.colors` (the markdown frontmatter shape) onto the
 * chart palette. Optional fields fall back to the defaults so charts that
 * need `green`/`amber`/`red` always have something to render.
 *
 * `line` has no equivalent in the story frontmatter and stays at the
 * default — adjust here if a story ever needs a custom gridline color.
 */
/**
 * True when viewport is portrait (mobile-like). Shared across all charts.
 *
 * Uses `useSyncExternalStore` rather than the `useState` + `useEffect`
 * subscription pattern because React 19's concurrent renderer can miss
 * updates from external stores when the subscription is set up inside an
 * effect — the symptom is that resizing _into_ a breakpoint re-renders
 * (the initial mount runs the effect, which sets the correct state) but
 * resizing _back out_ does not (the effect's `setState` call from the
 * `change` handler can be dropped or torn).
 *
 * `useSyncExternalStore` is the canonical API for subscribing to an
 * external mutable source like `matchMedia` and guarantees React stays
 * in sync with the source on every render.
 */
const MOBILE_MEDIA_QUERY = '(max-aspect-ratio: 1/1)'

// Cache the MediaQueryList so the subscription target and snapshot reader
// share the same object and it can never be garbage-collected mid-session.
let _mql: MediaQueryList | null = null
function getMql(): MediaQueryList {
  if (!_mql) _mql = window.matchMedia(MOBILE_MEDIA_QUERY)
  return _mql
}

function subscribeMobile(onStoreChange: () => void): () => void {
  const mql = getMql()
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

function getMobileSnapshot(): boolean {
  return getMql().matches
}

function getMobileServerSnapshot(): boolean {
  return false
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeMobile, getMobileSnapshot, getMobileServerSnapshot)
}

/**
 * NOTE: the ECharts-shaped `chartTooltip()` helper used to live here. It moved
 * to `charts/echarts/_kit/tooltip.ts` when the engine split landed — this file
 * is now engine-agnostic (no ECharts/D3 option shapes) so both engines can
 * depend on it. Import `chartTooltip` from the echarts kit instead.
 */

export function themeToChartColors(theme: Theme): ChartColors {
  return {
    accent: theme.colors.accent,
    accent2: theme.colors.accent2,
    teal: theme.colors.teal,
    green: theme.colors.positive ?? defaultChartColors.green,
    amber: theme.colors.amber ?? defaultChartColors.amber,
    red: theme.colors.red ?? defaultChartColors.red,
    muted: theme.colors.muted,
    line: theme.colors.line ?? defaultChartColors.line,
    surface: theme.colors.surface,
    chromeBg: defaultChartColors.chromeBg,
    chromeText: defaultChartColors.chromeText,
    chromeTextDim: defaultChartColors.chromeTextDim,
    chromeTextMuted: defaultChartColors.chromeTextMuted,
  }
}
