/**
 * Fixed palette for the /iea country detail charts. Matches the source order
 * in `MIX_SOURCES` in lib/epics.ts so the stacked-area sources read coal →
 * gas → oil at the bottom, renewables on top.
 */
export const ENERGY_SOURCE_COLORS: Record<string, string> = {
  Coal: '#52525b',
  Gas: '#f59e0b',
  Oil: '#b45309',
  Nuclear: '#a78bfa',
  Hydro: '#0ea5e9',
  Wind: '#60a5fa',
  Solar: '#fcd34d',
  Bioenergy: '#22c55e',
  'Other renewables': '#14b8a6',
}

export const CHART_AXIS_COLOR = '#71717a'
export const CHART_LINE_COLOR = '#27272a'
export const CHART_ACCENT = '#f59e0b'
