import { z } from 'zod'
import type { VizModule } from '../../types'
import { AlignSchema, parseWithSchema } from '../../lib/zodConfig'

/**
 * Zod schema for the `quote` module — a deck-format pull quote. Renders large
 * italic serif text with an optional attribution line. The deck layout
 * typically pairs this with a prose body in a `text-left-quote-right` split.
 */
export const quoteSchema = z.object({
  type: z.literal('quote'),
  text: z
    .string()
    .trim()
    .min(1)
    .describe('The quoted text. Required. May contain inline markdown for emphasis.'),
  attribution: z
    .string()
    .trim()
    .optional()
    .describe('Optional attribution line, e.g. "Falcon 9 → Starlink supply chain".'),
  align: AlignSchema.default('left').describe('Horizontal alignment inside the region. Defaults to left.'),
})

export type QuoteLayerConfig = z.infer<typeof quoteSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): QuoteLayerConfig {
  return parseWithSchema(quoteSchema, raw, ctx)
}

/**
 * Stable identity by quote-text prefix so distinct quotes don't share an
 * instance (which would cause the text to morph between scrolls).
 */
function stableIdentity(config: QuoteLayerConfig): string {
  return `quote:${config.text.slice(0, 64)}`
}

const quoteModule: VizModule<QuoteLayerConfig> = {
  type: 'quote',
  label: 'Quote',
  slots: ['foreground'],
  schema: quoteSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity,
  defaultStyle: { pointerEvents: 'none' },
  regionPreferences: ['body', 'quote'],
  adminForm: () => [
    { kind: 'text', key: 'text', label: 'Quote text', required: true },
    { kind: 'text', key: 'attribution', label: 'Attribution' },
    {
      kind: 'select',
      key: 'align',
      label: 'Alignment',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Centre' },
        { value: 'right', label: 'Right' },
      ],
    },
  ],
}

export default quoteModule
