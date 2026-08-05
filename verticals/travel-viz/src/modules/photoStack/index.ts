import { z } from 'zod'
import type { VizModule } from '@vismay/viz-engine'
import { parseWithSchema } from '@vismay/viz-engine'

/**
 * `travel:photoStack` — a fanned pile of matted photos: the top one reads as
 * a full polaroid, the rest peek out behind at slight rotations. The scrapbook
 * treatment for stops with many photos; `moreCount`/`moreHref` add a small
 * "+ N more ↗" tab that deep-links to the journey view.
 */
export const photoStackSchema = z.object({
  type: z.literal('travel:photoStack'),
  items: z
    .array(
      z.object({
        src: z.string().refine((s) => s.trim().length > 0, 'src is required'),
        caption: z.string().optional(),
        focus: z.string().optional().describe('CSS object-position focal point.'),
      })
    )
    .min(2)
    .max(5)
    .describe('Photos in the pile, top of the stack first.'),
  moreCount: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Renders a "+ N more ↗" tab on the stack.'),
  moreHref: z
    .string()
    .optional()
    .describe('Where the "+ N more" tab links (e.g. the journey view).'),
  rotationSpread: z
    .number()
    .min(0)
    .max(20)
    .default(6)
    .describe('Total degrees the pile fans across.'),
  enterDelay: z.number().min(0).max(2000).optional().describe('Entrance stagger in ms.'),
})

export type PhotoStackLayerConfig = z.infer<typeof photoStackSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): PhotoStackLayerConfig {
  return parseWithSchema(photoStackSchema, raw, ctx)
}

const photoStackModule: VizModule<PhotoStackLayerConfig> = {
  type: 'travel:photoStack',
  label: 'Photo stack',
  slots: ['foreground'],
  schema: photoStackSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) => `travel:photoStack:${config.items.map((i) => i.src).join('|')}`,
  collectAssetKeys: (config) =>
    config.items.map((i) => i.src).filter((s) => s.startsWith('assets://')),
  defaultStyle: {
    pointerEvents: 'none',
  },
  adminForm: () => [
    { kind: 'number', key: 'moreCount', label: '"+ N more" count' },
    { kind: 'text', key: 'moreHref', label: '"+ N more" link' },
    { kind: 'number', key: 'rotationSpread', label: 'Fan spread (deg)' },
  ],
}

export default photoStackModule
