import { z } from 'zod'
import type { VizModule } from '@vismay/viz-engine'
import { parseWithSchema } from '@vismay/viz-engine'

/**
 * Zod schema for the `travel:polaroid` module. `src` accepts an
 * `assets://<key>` ref, an absolute URL, or a same-origin `/public` path —
 * same contract as the core `image` module.
 */
export const polaroidSchema = z.object({
  type: z.literal('travel:polaroid'),
  src: z
    .string()
    .refine((s) => s.trim().length > 0, 'src is required (assets://… , https://… , or /public path)')
    .describe('`assets://<key>`, absolute URL, or same-origin `/public` path.'),
  alt: z.string().optional().describe('Alt text describing the photo.'),
  caption: z.string().optional().describe('Handwritten-style caption under the photo.'),
  rotation: z
    .number()
    .min(-45)
    .max(45)
    .default(0)
    .describe('Tilt in degrees (positive = clockwise). Scrapbook scatter looks best within ±8.'),
  tape: z
    .enum(['top', 'corner', 'none'])
    .default('top')
    .describe('Masking-tape accent: a strip across the top edge, a corner piece, or none.'),
  shadow: z.boolean().default(true).describe('Drop shadow lifting the polaroid off the page.'),
  focus: z
    .string()
    .optional()
    .describe("CSS object-position for the photo's focal point, e.g. 'top' or '30% 50%'."),
})

export type PolaroidLayerConfig = z.infer<typeof polaroidSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): PolaroidLayerConfig {
  return parseWithSchema(polaroidSchema, raw, ctx)
}

const polaroidModule: VizModule<PolaroidLayerConfig> = {
  type: 'travel:polaroid',
  label: 'Polaroid photo',
  slots: ['foreground'],
  schema: polaroidSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  // Same-src polaroids across snaps share one decoded bitmap; rotation and
  // caption are presentational and part of identity so two different framings
  // of the same photo don't collapse into one mount.
  stableIdentity: (config) =>
    `travel:polaroid:${config.src}::${config.rotation ?? 0}::${config.caption ?? ''}`,
  collectAssetKeys: (config) => (config.src.startsWith('assets://') ? [config.src] : []),
  // Non-interactive so wheel/touch pass through to the snap-scroll container —
  // same rationale as the core image module.
  defaultStyle: {
    pointerEvents: 'none',
  },
  adminForm: () => [
    { kind: 'asset', key: 'src', label: 'Photo', accept: ['image/*'], required: true },
    { kind: 'text', key: 'caption', label: 'Caption', placeholder: '7am, before the crowds…' },
    { kind: 'text', key: 'alt', label: 'Alt text', placeholder: 'Describe the photo…' },
    { kind: 'number', key: 'rotation', label: 'Rotation (deg)' },
    {
      kind: 'select',
      key: 'tape',
      label: 'Tape',
      options: [
        { value: 'top', label: 'Top strip' },
        { value: 'corner', label: 'Corner piece' },
        { value: 'none', label: 'None' },
      ],
    },
    { kind: 'boolean', key: 'shadow', label: 'Drop shadow' },
    { kind: 'text', key: 'focus', label: 'Focus (CSS object-position)', placeholder: 'center / top / 30% 50%' },
  ],
}

export default polaroidModule
