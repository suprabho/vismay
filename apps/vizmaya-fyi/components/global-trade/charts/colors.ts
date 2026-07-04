/**
 * Fixed palette for the /global-trade detail charts and the radial trade
 * network. Axis/line greys match the energy-profile chart chrome so epic
 * detail sheets feel like one family.
 */
export const CHART_AXIS_COLOR = '#7c8894'
export const CHART_LINE_COLOR = '#1e2833'
export const CHART_ACCENT = '#2dd4bf'
export const CHART_CHAPTER = '#e8b84b'
export const CHART_TOOLTIP_BG = '#141b24'
export const CHART_TOOLTIP_TEXT = '#e9f1f2'

/** "$1.34T" / "$45.2B" / "$3.1M" — trade values are plain nominal USD. */
export function formatUsd(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}k`
  return `$${Math.round(value)}`
}

/** HS product names are legalese ("Electrical apparatus for line telephony,
 *  including…") — keep the first clause, capped, for labels; tooltips show
 *  the full name. */
export function shortProductName(name: string, max = 34): string {
  const clause = name.split(/[;,(]/)[0].trim()
  if (clause.length <= max) return clause
  return `${clause.slice(0, max - 1).trimEnd()}…`
}
