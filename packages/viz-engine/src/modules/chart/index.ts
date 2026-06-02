import type { VizModule } from '../../types'

export interface ChartLayerConfig {
  type: 'chart'
  id: string
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): ChartLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: chart layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id.trim().length === 0) {
    throw new Error(`${ctx.label}: chart layer requires 'id' (string)`)
  }
  return { type: 'chart', id: r.id }
}

const chartModule: VizModule<ChartLayerConfig> = {
  type: 'chart',
  label: 'Chart',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) => `chart:${config.id}`,
  aiSchema:
    `Accepted fields (a field marked (required) must be present):\n` +
    `  - id: string (required) — references a chart already defined for this ` +
    `story by its id. A chart layer only *references* a chart; you cannot ` +
    `define the chart's data or type here.\n\n` +
    `Example shape:\n` +
    `type: chart\n` +
    `id: revenue-growth`,
}

export default chartModule
