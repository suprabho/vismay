import { z } from 'zod'
import type { VizModule } from '../../types'
import { StatColorSchema, parseWithSchema } from '../../lib/zodConfig'

const KeyValueItemSchema = z.object({
  key: z.string().trim().min(1).describe('The label (left column).'),
  value: z.string().trim().min(1).describe('The value (right column).'),
  color: StatColorSchema.optional().describe("Theme token applied to the value's color."),
})

export type KeyValueItem = z.infer<typeof KeyValueItemSchema>

/**
 * Zod schema for the `keyValue` module — the deck-format definition list.
 * Renders a two-column list typically used for closing summaries or sidebar
 * facts. 1–12 key/value items, each with an optional value-colour token.
 */
export const keyValueSchema = z.object({
  type: z.literal('keyValue'),
  title: z.string().trim().optional().describe('Optional title above the list.'),
  items: z
    .array(KeyValueItemSchema)
    .min(1)
    .max(12)
    .describe('1–12 key/value items: [{ key, value, color? }].'),
})

export type KeyValueLayerConfig = z.infer<typeof keyValueSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): KeyValueLayerConfig {
  return parseWithSchema(keyValueSchema, raw, ctx)
}

const keyValueModule: VizModule<KeyValueLayerConfig> = {
  type: 'keyValue',
  label: 'Key/value list',
  slots: ['foreground'],
  schema: keyValueSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  // No stableIdentity — keyValue layers remount cheaply per region.
  defaultStyle: { pointerEvents: 'none' },
  regionPreferences: ['body', 'sidebar'],
  adminForm: () => [
    { kind: 'text', key: 'title', label: 'Optional title' },
    { kind: 'json', key: 'items', label: 'Items ([{ key, value, color? }])', required: true },
  ],
}

export default keyValueModule
