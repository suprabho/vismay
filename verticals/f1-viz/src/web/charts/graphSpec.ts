/**
 * Telemetry GraphSpec — a render-library-agnostic chart description.
 *
 * Ported from the f1_backend donor (`Frontend/src/types.ts`). The AI/story
 * pipeline and the worker emit these; `graphSpecToECharts` adapts them to the
 * monorepo's ECharts host (`StoryEChart`). Heavy series data (`dataPoints`) is
 * precomputed upstream — the chart never derives forecasts at render time.
 */

export type GraphType =
  | 'line'
  | 'multi_line'
  | 'comparison'
  | 'bar'
  | 'bar_grouped'
  | 'sparkline'
  | 'scatter'
  | 'area'
  | 'projection'
  | 'tire_map'
  | 'heat_map'

export interface GraphSeries {
  id: string
  label: string
  driverNumber?: number
  /** Hex color (e.g. team colour). */
  color: string
  /** Key into each `dataPoints` row for this series' y value. */
  dataKey: string
  /** Any truthy value → dashed line. */
  strokeDash?: string
  type: 'actual' | 'projected' | 'reference'
}

export interface GraphAnnotation {
  type: 'point' | 'band' | 'line' | 'label'
  xValue?: number | string
  xRange?: [number | string, number | string]
  color: string
  label: string
  meta?: Record<string, unknown>
}

export interface GraphSpec {
  id: string
  type: GraphType
  title?: string
  subtitle?: string
  sessionKey?: string
  xAxis?: { key: string; label: string; unit: string }
  yAxis?: { key: string; label: string; unit: string; domain?: [number, number] }
  series: GraphSeries[]
  dataPoints: Record<string, unknown>[]
  projectionConfig?: {
    method: 'linear' | 'polynomial' | 'exponential'
    historicalLaps: number
    forecastLaps: number
    confidenceBand: boolean
  }
  annotations?: GraphAnnotation[]
}
