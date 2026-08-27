/**
 * Fixed palette for the /ai-data-centers facility detail charts. Metric keys
 * match DC_METRICS in @vismay/content-source/epics.
 */
export const DC_METRIC_COLORS: Record<string, string> = {
  power_mw: '#22d3ee',         // cyan — matches the epic accent
  h100_equivalents: '#a78bfa', // violet
  capex_usd_bn: '#34d399',     // green, money
}

export const CHART_AXIS_COLOR = '#71717a'
export const CHART_LINE_COLOR = '#27272a'
