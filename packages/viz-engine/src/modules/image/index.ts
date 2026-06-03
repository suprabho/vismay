import { z } from 'zod'
import type { VizModule } from '../../types'
import { parseWithSchema } from '../../lib/zodConfig'

const ImageFitSchema = z.enum(['cover', 'contain', 'fill', 'scale-down', 'none'])
export type ImageFit = z.infer<typeof ImageFitSchema>

/**
 * Zod schema for the `image` module. `src` accepts an `assets://<key>` ref, an
 * absolute URL, or a same-origin `/public` path (kept verbatim — not trimmed —
 * to preserve exact asset keys).
 */
export const imageSchema = z.object({
  type: z.literal('image'),
  src: z
    .string()
    .refine((s) => s.trim().length > 0, 'src is required (assets://… , https://… , or /public path)')
    .describe('`assets://<key>`, absolute URL, or same-origin `/public` path.'),
  alt: z.string().optional().describe('Alt text describing the image.'),
  fit: ImageFitSchema.default('cover').describe('CSS object-fit. Defaults to cover (fills the slot, crops overflow).'),
  focus: z
    .string()
    .optional()
    .describe("CSS object-position to shift the focal point, e.g. 'top' or '30% 50%'."),
  background: z.string().optional().describe('Background color shown while loading / where contain letterboxes.'),
  priority: z
    .boolean()
    .default(false)
    .describe('Marks an above-the-fold / LCP image so it loads eagerly. Defaults to false.'),
  sizes: z.string().optional().describe("`sizes` attribute hint (defaults to '100vw')."),
})

export type ImageLayerConfig = z.infer<typeof imageSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): ImageLayerConfig {
  return parseWithSchema(imageSchema, raw, ctx)
}

const imageModule: VizModule<ImageLayerConfig> = {
  type: 'image',
  label: 'Image',
  slots: ['foreground', 'background'],
  schema: imageSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  // Multiple sections referencing the same image src share one mount so the
  // browser can keep the decoded bitmap in memory across scroll snaps. The
  // styling (focus / fit / opacity) is part of identity because two cards
  // showing the same src with different framing should NOT share — they
  // need separate <img> elements with their own object-fit.
  stableIdentity: (config) =>
    `image:${config.src}::${config.fit ?? 'cover'}::${config.focus ?? 'center'}::${config.background ?? ''}`,
  collectAssetKeys: (config) => (config.src.startsWith('assets://') ? [config.src] : []),
  // Images are non-interactive by default so scroll/wheel events pass through
  // to the snap-scroll container — critical when an image fills a foreground
  // region edge-to-edge (otherwise the user can't scroll past that section).
  // Authors who want a clickable image opt back in via `style.pointerEvents: 'auto'`.
  defaultStyle: {
    pointerEvents: 'none',
  },
  adminForm: () => [
    { kind: 'asset', key: 'src', label: 'Image source', accept: ['image/*'], required: true },
    { kind: 'text', key: 'alt', label: 'Alt text', placeholder: 'Describe the image…' },
    { kind: 'boolean', key: 'priority', label: 'Priority (hero / above the fold — eager + high fetchpriority)' },
    {
      kind: 'select',
      key: 'fit',
      label: 'Fit',
      options: [
        { value: 'cover', label: 'Cover (fill, crop overflow)' },
        { value: 'contain', label: 'Contain (fit inside, letterbox)' },
        { value: 'fill', label: 'Fill (stretch)' },
        { value: 'scale-down', label: 'Scale down' },
        { value: 'none', label: 'None (intrinsic size)' },
      ],
    },
    { kind: 'text', key: 'focus', label: 'Focus (CSS object-position)', placeholder: 'center / top / 30% 50%' },
    { kind: 'text', key: 'background', label: 'Background color', placeholder: '#000 or transparent' },
  ],
}

export default imageModule
