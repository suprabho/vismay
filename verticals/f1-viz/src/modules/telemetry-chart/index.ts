import type { VizModule } from '@vismay/viz-engine'
import type { GraphSpec, GraphType } from '../../web/charts/graphSpec'

/**
 * `f1:telemetry-chart` — Foreground viz module: a telemetry chart (lap-time
 * trend, pace comparison, tyre degradation, projection, scatter, heatmap)
 * driven by an inline `GraphSpec`. Rendered through the monorepo's capture-safe
 * ECharts host (`StoryEChart`), NOT a second chart engine.
 *
 * The heavy series data (`dataPoints`) is precomputed upstream (worker / AI
 * pipeline) and carried inline — the chart never derives forecasts at render
 * time. JSON-native, so it round-trips through the f1 compose pipeline.
 */
export interface TelemetryChartConfig {
  type: 'f1:telemetry-chart'
  spec: GraphSpec
  caption?: string
}

const GRAPH_TYPES = new Set<GraphType>([
  'line',
  'multi_line',
  'comparison',
  'bar',
  'bar_grouped',
  'sparkline',
  'scatter',
  'area',
  'projection',
  'tire_map',
  'heat_map',
])

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): TelemetryChartConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: f1:telemetry-chart layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  const spec = r.spec as GraphSpec | undefined
  if (!spec || typeof spec !== 'object') {
    throw new Error(`${ctx.label}: f1:telemetry-chart requires a 'spec' object`)
  }
  if (typeof spec.type !== 'string' || !GRAPH_TYPES.has(spec.type as GraphType)) {
    throw new Error(`${ctx.label}: f1:telemetry-chart 'spec.type' must be a known graph type`)
  }
  if (!Array.isArray(spec.dataPoints) || spec.dataPoints.length === 0) {
    throw new Error(`${ctx.label}: f1:telemetry-chart 'spec.dataPoints' must be a non-empty array`)
  }
  if (!Array.isArray(spec.series)) {
    throw new Error(`${ctx.label}: f1:telemetry-chart 'spec.series' must be an array`)
  }
  return {
    type: 'f1:telemetry-chart',
    spec,
    caption: typeof r.caption === 'string' ? r.caption : undefined,
  }
}

const telemetryChartModule: VizModule<TelemetryChartConfig> = {
  type: 'f1:telemetry-chart',
  label: 'F1 — telemetry chart',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) => `f1:telemetry-chart:${config.spec.id}:${config.spec.type}`,
}

export default telemetryChartModule
