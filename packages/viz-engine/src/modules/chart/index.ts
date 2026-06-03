import { z } from 'zod'
import type { VizModule } from '../../types'
import { parseWithSchema } from '../../lib/zodConfig'

/**
 * Zod schema for the `chart` module. A chart layer only *references* a chart
 * already defined for the story by its id — it cannot define the chart's data
 * or type inline.
 */
export const chartSchema = z.object({
  type: z.literal('chart'),
  id: z
    .string()
    .min(1)
    .describe(
      'References a chart already defined for this story by its id (e.g. "revenue-growth"). ' +
        'A chart layer only references a chart; it cannot define the data or type here.',
    ),
})

export type ChartLayerConfig = z.infer<typeof chartSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): ChartLayerConfig {
  return parseWithSchema(chartSchema, raw, ctx)
}

const chartModule: VizModule<ChartLayerConfig> = {
  type: 'chart',
  label: 'Chart',
  slots: ['foreground'],
  schema: chartSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) => `chart:${config.id}`,
}

export default chartModule
