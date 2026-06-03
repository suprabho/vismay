import { z } from 'zod'
import type { VizModule } from '../../types'
import { parseWithSchema } from '../../lib/zodConfig'

const ImageGridItemSchema = z.object({
  src: z.string().trim().min(1).describe('`assets://<key>`, absolute URL, or /public path.'),
  alt: z.string().optional().describe('Alt text describing the image.'),
  caption: z.string().optional().describe('Optional caption beneath this image.'),
})

export type ImageGridItem = z.infer<typeof ImageGridItemSchema>

/**
 * Zod schema for the `imageGrid` module — the deck-format mosaic. 2–6 images
 * arranged in a responsive grid whose layout is chosen by count (2 → 2×1,
 * 3 → 3×1, 4 → 2×2, 5 → 3-2 split, 6 → 3×2).
 *
 * `fit` coerces any non-`contain` value to `cover` (mirrors the legacy parser),
 * so an unexpected value degrades gracefully rather than failing the section.
 */
export const imageGridSchema = z.object({
  type: z.literal('imageGrid'),
  items: z
    .array(ImageGridItemSchema)
    .min(2)
    .max(6)
    .describe('2–6 images: [{ src, alt?, caption? }].'),
  caption: z.string().optional().describe('Optional caption rendered below the grid.'),
  fit: z
    .enum(['cover', 'contain'])
    .catch('cover')
    .describe('CSS object-fit for every image. Defaults to cover.'),
})

export type ImageGridLayerConfig = z.infer<typeof imageGridSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): ImageGridLayerConfig {
  return parseWithSchema(imageGridSchema, raw, ctx)
}

const imageGridModule: VizModule<ImageGridLayerConfig> = {
  type: 'imageGrid',
  label: 'Image grid',
  slots: ['foreground'],
  schema: imageGridSchema,
  parseConfig,
  load: () => import('./Component'),
  // First-paint readiness: every image must load (or error) before the slot
  // signals ready, so PDF capture waits for the mosaic to settle.
  readinessProfile: 'first-paint',
  // Stable by image-src list — duplicate identical grids share an instance.
  stableIdentity: (cfg) => `imageGrid:${cfg.items.map((i) => i.src).join('|').slice(0, 96)}`,
  defaultStyle: { pointerEvents: 'none' },
  adminForm: () => [
    { kind: 'json', key: 'items', label: 'Items ([{ src, alt?, caption? }])', required: true },
    { kind: 'text', key: 'caption', label: 'Caption' },
    {
      kind: 'select',
      key: 'fit',
      label: 'Fit',
      options: [
        { value: 'cover', label: 'Cover (crop to fill)' },
        { value: 'contain', label: 'Contain (no crop)' },
      ],
    },
  ],
  aiFieldExamples: {
    items:
      'items:\n' +
      '  - { src: "assets://photo-1.jpg", alt: "Falcon 9 liftoff" }\n' +
      '  - { src: "assets://photo-2.jpg", caption: "Booster landing" }',
  },
}

export default imageGridModule
