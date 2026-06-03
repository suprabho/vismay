import { z } from 'zod'
import type { VizModule } from '../../types'
import { parseWithSchema } from '../../lib/zodConfig'

/**
 * Zod schema for the `embed` module — an iframe for third-party content
 * (tweets, Observable notebooks, YouTube, …). A `poster` is required because
 * cross-origin iframes don't rasterize reliably into PDFs / share-card
 * screenshots, so capture/print modes render the poster instead.
 */
export const embedSchema = z.object({
  type: z.literal('embed'),
  src: z
    .string()
    .trim()
    .min(1)
    .describe('Absolute URL of the embedded resource (tweet, Observable notebook, YouTube, …). Required.'),
  poster: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Static poster image (assets://, https://, or /public). Required — cross-origin iframes can't rasterize in PDF/share captures.",
    ),
  aspect: z
    .string()
    .default('16 / 9')
    .describe("CSS aspect-ratio. Defaults to '16 / 9'; use 'auto' to let the iframe size itself."),
  sandbox: z
    .string()
    .default('allow-scripts')
    .describe(
      "iframe sandbox attribute. Defaults to 'allow-scripts'; opt into more (allow-same-origin, allow-forms, …) only for trusted sources.",
    ),
  allow: z.string().optional().describe('iframe allow attribute (camera, autoplay, …). Empty by default.'),
  referrerPolicy: z.string().optional().describe("iframe referrerpolicy. Defaults to the browser's."),
  title: z.string().default('Embedded content').describe('Accessibility title. Defaults to "Embedded content".'),
})

export type EmbedLayerConfig = z.infer<typeof embedSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): EmbedLayerConfig {
  return parseWithSchema(embedSchema, raw, ctx)
}

const embedModule: VizModule<EmbedLayerConfig> = {
  type: 'embed',
  label: 'Embed (iframe)',
  slots: ['foreground', 'background'],
  schema: embedSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) => `embed:${config.src}::${config.sandbox ?? ''}`,
  collectAssetKeys: (config) => {
    const keys: string[] = []
    if (config.poster.startsWith('assets://')) keys.push(config.poster)
    return keys
  },
  adminForm: () => [
    { kind: 'text', key: 'src', label: 'Embed URL', placeholder: 'https://…', required: true },
    {
      kind: 'asset',
      key: 'poster',
      label: 'Poster image (required for capture)',
      accept: ['image/*'],
      required: true,
    },
    { kind: 'text', key: 'aspect', label: 'Aspect ratio (CSS)', placeholder: '16 / 9' },
    { kind: 'text', key: 'sandbox', label: 'iframe sandbox attribute', placeholder: 'allow-scripts' },
    { kind: 'text', key: 'title', label: 'Accessibility title' },
  ],
}

export default embedModule
