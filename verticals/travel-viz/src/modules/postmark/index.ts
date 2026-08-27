import { z } from 'zod'
import type { VizModule } from '@vismay/viz-engine'
import { parseWithSchema } from '@vismay/viz-engine'

/**
 * `travel:postmark` — a circular rubber-stamp postmark: place around the ring,
 * time (and optional emoji) in the center. The time/place anchor of every
 * scrapbook spread.
 */
export const postmarkSchema = z.object({
  type: z.literal('travel:postmark'),
  place: z
    .string()
    .refine((s) => s.trim().length > 0, 'place is required')
    .describe('Place name stamped around/inside the ring.'),
  time: z.string().optional().describe('Center line, e.g. "7:00 AM".'),
  emoji: z.string().optional().describe('Small emoji above the time.'),
  color: z.string().default('#42392c').describe('Ink color.'),
  rotation: z.number().min(-20).max(20).default(-8).describe('Stamp tilt in degrees.'),
  enterDelay: z.number().min(0).max(2000).optional().describe('Entrance stagger in ms.'),
})

export type PostmarkLayerConfig = z.infer<typeof postmarkSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): PostmarkLayerConfig {
  return parseWithSchema(postmarkSchema, raw, ctx)
}

const postmarkModule: VizModule<PostmarkLayerConfig> = {
  type: 'travel:postmark',
  label: 'Postmark stamp',
  slots: ['foreground'],
  schema: postmarkSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) => `travel:postmark:${config.place}::${config.time ?? ''}`,
  defaultStyle: {
    pointerEvents: 'none',
  },
  adminForm: () => [
    { kind: 'text', key: 'place', label: 'Place', required: true },
    { kind: 'text', key: 'time', label: 'Time', placeholder: '7:00 AM' },
    { kind: 'text', key: 'emoji', label: 'Emoji' },
    { kind: 'text', key: 'color', label: 'Ink color' },
    { kind: 'number', key: 'rotation', label: 'Rotation (deg)' },
  ],
}

export default postmarkModule
