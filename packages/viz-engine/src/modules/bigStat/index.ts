import { z } from 'zod'
import type { VizModule } from '../../types'
import { AlignSchema, StatColorSchema, parseWithSchema } from '../../lib/zodConfig'

/**
 * Theme palette token used for the delta line. `StatColor` already includes
 * `positive`, so the delta colour set is exactly `StatColor`.
 */
export type DeltaColor = z.infer<typeof StatColorSchema>

/**
 * Zod schema for the `bigStat` module — the deck format's composable
 * giant-number vizslot. Unlike the legacy `text` module's `kind: stat`
 * treatment (which centres in the whole section), `bigStat` lives inside a
 * region of a deck layout and respects the region's box. Use this when a stat
 * sits side-by-side with a chart, image, or prose body.
 *
 * Single source of truth: validates `parseConfig` AND constrains the AI
 * generation path (the `.describe()` lines are the field docs the model reads).
 */
export const bigStatSchema = z.object({
  type: z.literal('bigStat'),
  value: z
    .string()
    .min(1)
    .describe('The big number itself, e.g. "$18.7B" or "10.3M". Required.'),
  unit: z
    .string()
    .optional()
    .describe('Optional unit/suffix rendered smaller next to the value, e.g. "B".'),
  label: z.string().optional().describe('Short label beneath the number.'),
  delta: z
    .string()
    .optional()
    .describe('Secondary line below the label — typically a YoY delta, e.g. "+33% YoY".'),
  deltaColor: StatColorSchema.optional().describe('Theme token for the delta line. Defaults to muted.'),
  color: StatColorSchema.optional().describe('Theme token for the big number. Defaults to accent2.'),
  align: AlignSchema.default('left').describe('Horizontal alignment inside the region. Defaults to left.'),
})

/** Layer config for the `bigStat` module. Derived from {@link bigStatSchema}. */
export type BigStatLayerConfig = z.infer<typeof bigStatSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): BigStatLayerConfig {
  return parseWithSchema(bigStatSchema, raw, ctx)
}

/**
 * Deterministic identity so multiple `bigStat` layers on the same unit don't
 * collapse into one instance. Keyed by the value text — distinct stats render
 * as distinct components, identical stats reuse.
 */
function stableIdentity(config: BigStatLayerConfig): string {
  return `bigStat:${config.value}`
}

const bigStatModule: VizModule<BigStatLayerConfig> = {
  type: 'bigStat',
  label: 'Big stat',
  slots: ['foreground'],
  schema: bigStatSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity,
  // No default panel — the deck format applies frosted-glass chrome via
  // `defaults.panel`, and a bare `bigStat` in a non-deck context should sit
  // borderless on whatever surface it lands.
  defaultStyle: {
    pointerEvents: 'none',
  },
  regionPreferences: ['lead', 'stat'],
  adminForm: () => [
    { kind: 'text', key: 'value', label: 'Big number', placeholder: '$18.7B', required: true },
    { kind: 'text', key: 'unit', label: 'Unit suffix' },
    { kind: 'text', key: 'label', label: 'Label beneath number' },
    { kind: 'text', key: 'delta', label: 'Delta line (optional)' },
    { kind: 'theme-token', key: 'color', label: 'Number color' },
    { kind: 'theme-token', key: 'deltaColor', label: 'Delta color' },
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

export default bigStatModule
