import { z } from 'zod'
import type { VizModule } from '../../types'
import { parseWithSchema } from '../../lib/zodConfig'

const BodyTextSizeSchema = z.enum(['small', 'normal', 'large'])
const BodyTextColorSchema = z.enum(['text', 'muted', 'accent', 'accent2'])

export type BodyTextSize = z.infer<typeof BodyTextSizeSchema>
export type BodyTextColor = z.infer<typeof BodyTextColorSchema>

/**
 * Zod schema for the `bodyText` module — the deck format's prose vizslot.
 * Composed alongside charts and stats in a region; reads its paragraphs from
 * the anchored markdown unit by default.
 *
 * `from` has only one supported mode today (`'text'`, the default), which pulls
 * paragraphs from the current unit's resolved content. Set `content` to supply
 * literal prose that doesn't live in the markdown.
 */
export const bodyTextSchema = z.object({
  type: z.literal('bodyText'),
  from: z
    .literal('text')
    .default('text')
    .describe("Source mode. Only 'text' is supported (reads the unit's paragraphs)."),
  content: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Literal paragraph(s) — a string or array of strings. Overrides the unit paragraphs.'),
  heading: z.string().optional().describe('Optional heading rendered above the paragraphs.'),
  showHeading: z.boolean().default(false).describe('Whether to render the heading. Defaults to false.'),
  textStyle: z
    .object({
      size: BodyTextSizeSchema.optional(),
      color: BodyTextColorSchema.optional(),
    })
    .default({})
    .describe('Text styling: size (small | normal | large) and color (text | muted | accent | accent2).'),
})

export type BodyTextLayerConfig = z.infer<typeof bodyTextSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): BodyTextLayerConfig {
  return parseWithSchema(bodyTextSchema, raw, ctx)
}

const bodyTextModule: VizModule<BodyTextLayerConfig> = {
  type: 'bodyText',
  label: 'Body text',
  slots: ['foreground'],
  schema: bodyTextSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  // No stableIdentity — bodyText layers remount cheaply per region.
  regionPreferences: ['body', 'text'],
  defaultStyle: {
    pointerEvents: 'none',
  },
  adminForm: () => [
    { kind: 'boolean', key: 'showHeading', label: 'Show heading above paragraphs' },
    { kind: 'text', key: 'heading', label: 'Heading override' },
    { kind: 'json', key: 'content', label: 'Content override (string | string[])' },
    {
      kind: 'select',
      key: 'textStyle.size',
      label: 'Size',
      options: [
        { value: 'small', label: 'Small' },
        { value: 'normal', label: 'Normal' },
        { value: 'large', label: 'Large' },
      ],
    },
    {
      kind: 'select',
      key: 'textStyle.color',
      label: 'Color',
      options: [
        { value: 'text', label: 'Text' },
        { value: 'muted', label: 'Muted' },
        { value: 'accent', label: 'Accent' },
        { value: 'accent2', label: 'Accent 2' },
      ],
    },
  ],
}

export default bodyTextModule
