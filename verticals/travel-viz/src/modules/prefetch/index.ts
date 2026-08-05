import { z } from 'zod'
import type { VizModule } from '@vismay/viz-engine'
import { parseWithSchema } from '@vismay/viz-engine'

/**
 * `travel:prefetch` — invisible utility layer that idle-warms the next
 * spread's images. Map-format foregrounds hard-swap per snap unit (only the
 * active unit mounts), so without this every page turn starts its downloads
 * cold. The injection lib appends one of these per spread with the FOLLOWING
 * spread's srcs.
 */
export const prefetchSchema = z.object({
  type: z.literal('travel:prefetch'),
  srcs: z.array(z.string()).max(12).default([]),
})

export type PrefetchLayerConfig = z.infer<typeof prefetchSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): PrefetchLayerConfig {
  return parseWithSchema(prefetchSchema, raw, ctx)
}

const prefetchModule: VizModule<PrefetchLayerConfig> = {
  type: 'travel:prefetch',
  label: 'Prefetch (invisible)',
  slots: ['foreground'],
  schema: prefetchSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) => `travel:prefetch:${config.srcs[0] ?? 'empty'}`,
  defaultStyle: {
    pointerEvents: 'none',
  },
}

export default prefetchModule
