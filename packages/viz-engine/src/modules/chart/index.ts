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
}

export default chartModule
