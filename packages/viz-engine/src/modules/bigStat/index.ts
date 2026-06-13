import { z } from 'zod'
import type { VizModule } from '../../types'
import { AlignSchema, StatColorSchema, parseWithSchema } from '../../lib/zodConfig'

/**
 * Theme palette token used for the delta line. `StatColor` already includes
 * `positive`, so the delta colour set is exactly `StatColor`.
 */
export type DeltaColor = z.infer<typeof StatColorSchema>

/** Headline size preset — scales the number and its unit suffix together. */
const BigStatSizeSchema = z.enum(['sm', 'md', 'lg', 'xl'])
/** Vertical-rhythm preset for the gap between number / label / delta lines. */
const BigStatGapSchema = z.enum(['tight', 'normal', 'loose'])
/** Where the stack sits within the region box on the vertical (cross) axis. */
const BigStatJustifySchema = z.enum(['top', 'center', 'bottom'])

/**
 * A CSS length: a unitless number (treated as `px`) or any CSS length string
 * (`"8rem"`, `"40ch"`, `"60%"`, `"min(40ch, 80%)"`).
 */
const CssLengthSchema = z.union([z.number(), z.string().min(1)])

/**
 * Granular presentation controls for `bigStat`. Every field is optional. The
 * presets (`size`, `gap`, `justify`) set sensible bundles; the explicit length
 * fields override them for pixel-level control and always win over the matching
 * preset. Lengths accept a number (px) or any CSS length string.
 */
export const bigStatStyleSchema = z
  .object({
    // — Font sizes —
    size: BigStatSizeSchema.optional().describe(
      'Headline size preset: sm | md (default) | lg | xl. Scales the number and unit together.',
    ),
    numberFontSize: CssLengthSchema.optional().describe(
      'Explicit font size for the big number (e.g. "8rem" or 120). Overrides `size`.',
    ),
    unitFontSize: CssLengthSchema.optional().describe(
      'Explicit font size for the unit suffix. Overrides `size`.',
    ),
    labelFontSize: CssLengthSchema.optional().describe('Font size for the label line. Defaults to 0.75rem.'),
    deltaFontSize: CssLengthSchema.optional().describe('Font size for the delta line. Defaults to 0.85rem.'),
    // — Gap / layout —
    gap: BigStatGapSchema.optional().describe(
      'Vertical gap between number, label and delta: tight | normal (default) | loose.',
    ),
    gapSize: CssLengthSchema.optional().describe(
      'Explicit vertical gap between the stacked lines. Overrides `gap`.',
    ),
    unitGap: CssLengthSchema.optional().describe(
      'Horizontal gap between the number and its unit suffix. Defaults to 0.5rem.',
    ),
    justify: BigStatJustifySchema.optional().describe(
      'Vertical placement of the stack inside its region: top | center (default) | bottom.',
    ),
    // — Widths —
    width: CssLengthSchema.optional().describe('Fixed width of the stat box. Defaults to 100% of the region.'),
    minWidth: CssLengthSchema.optional().describe('Minimum width of the stat box.'),
    maxWidth: CssLengthSchema.optional().describe('Maximum width of the stat box.'),
    textMaxWidth: CssLengthSchema.optional().describe(
      'Wrap width for the label and delta lines. Defaults to 36ch.',
    ),
  })
  .default({})
  .describe('Granular sizing / layout / width controls. Presets set bundles; explicit lengths override.')

/** Presentation config for `bigStat`. Derived from {@link bigStatStyleSchema}. */
export type BigStatStyle = z.infer<typeof bigStatStyleSchema>

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
  statStyle: bigStatStyleSchema.describe(
    'Granular presentation: font sizes, gaps, vertical placement, and box widths (min/max).',
  ),
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
    {
      kind: 'select',
      key: 'statStyle.size',
      label: 'Number size',
      options: [
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Large' },
        { value: 'xl', label: 'Extra large' },
      ],
    },
    {
      kind: 'select',
      key: 'statStyle.gap',
      label: 'Vertical gap',
      options: [
        { value: 'tight', label: 'Tight' },
        { value: 'normal', label: 'Normal' },
        { value: 'loose', label: 'Loose' },
      ],
    },
    {
      kind: 'select',
      key: 'statStyle.justify',
      label: 'Vertical placement',
      options: [
        { value: 'top', label: 'Top' },
        { value: 'center', label: 'Centre' },
        { value: 'bottom', label: 'Bottom' },
      ],
    },
    { kind: 'text', key: 'statStyle.numberFontSize', label: 'Number font size (override)' },
    { kind: 'text', key: 'statStyle.unitFontSize', label: 'Unit font size (override)' },
    { kind: 'text', key: 'statStyle.labelFontSize', label: 'Label font size (override)' },
    { kind: 'text', key: 'statStyle.deltaFontSize', label: 'Delta font size (override)' },
    { kind: 'text', key: 'statStyle.gapSize', label: 'Vertical gap (override)' },
    { kind: 'text', key: 'statStyle.unitGap', label: 'Number-to-unit gap' },
    { kind: 'text', key: 'statStyle.width', label: 'Box width' },
    { kind: 'text', key: 'statStyle.minWidth', label: 'Box min width' },
    { kind: 'text', key: 'statStyle.maxWidth', label: 'Box max width' },
    { kind: 'text', key: 'statStyle.textMaxWidth', label: 'Label/delta wrap width' },
  ],
}

export default bigStatModule
