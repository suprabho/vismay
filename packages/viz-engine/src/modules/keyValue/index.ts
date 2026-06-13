import { z } from 'zod'
import type { VizModule } from '../../types'
import { StatColorSchema, parseWithSchema } from '../../lib/zodConfig'

const KeyValueItemSchema = z.object({
  key: z.string().trim().min(1).describe('The label (left column).'),
  value: z.string().trim().min(1).describe('The value (right column).'),
  color: StatColorSchema.optional().describe("Theme token applied to the value's color."),
})

export type KeyValueItem = z.infer<typeof KeyValueItemSchema>

/** Type-scale preset — scales the key and value text together. */
const KeyValueSizeSchema = z.enum(['sm', 'md', 'lg'])
/** Row-rhythm preset for the vertical gap between items. */
const KeyValueGapSchema = z.enum(['tight', 'normal', 'loose'])
/** Where the list sits within the region box on the vertical (cross) axis. */
const KeyValueJustifySchema = z.enum(['top', 'center', 'bottom'])
/** Two-column definition list, or key stacked above value. */
const KeyValueLayoutSchema = z.enum(['columns', 'stacked'])

/**
 * A CSS length: a unitless number (treated as `px`) or any CSS length string
 * (`"8rem"`, `"40ch"`, `"60%"`, `"minmax(8ch, 1fr)"`).
 */
const CssLengthSchema = z.union([z.number(), z.string().min(1)])

/**
 * Granular presentation controls for `keyValue`. Every field is optional. The
 * presets (`size`, `gap`, `justify`, `layout`) set sensible bundles; the
 * explicit length fields override them for pixel-level control and always win
 * over the matching preset. Lengths accept a number (px) or any CSS length
 * string.
 */
export const keyValueStyleSchema = z
  .object({
    // — Font sizes —
    size: KeyValueSizeSchema.optional().describe(
      'Type-scale preset: sm | md (default) | lg. Scales the key and value text together.',
    ),
    titleFontSize: CssLengthSchema.optional().describe('Font size for the title. Defaults to 0.75rem.'),
    keyFontSize: CssLengthSchema.optional().describe('Explicit font size for the key column. Overrides `size`.'),
    valueFontSize: CssLengthSchema.optional().describe(
      'Explicit font size for the value column. Overrides `size`.',
    ),
    // — Gap / layout —
    gap: KeyValueGapSchema.optional().describe(
      'Vertical gap between rows: tight | normal (default) | loose.',
    ),
    rowGap: CssLengthSchema.optional().describe('Explicit vertical gap between rows. Overrides `gap`.'),
    columnGap: CssLengthSchema.optional().describe(
      'Horizontal gap between the key and value columns (columns layout). Defaults to 1.5rem.',
    ),
    titleGap: CssLengthSchema.optional().describe('Gap below the title. Defaults to 1rem.'),
    layout: KeyValueLayoutSchema.optional().describe(
      'columns (default, two-column grid) | stacked (key above value).',
    ),
    justify: KeyValueJustifySchema.optional().describe(
      'Vertical placement of the list inside its region: top | center (default) | bottom.',
    ),
    // — Widths —
    keyColumnWidth: CssLengthSchema.optional().describe(
      'Fixed width of the key column (columns layout). Defaults to auto-fit.',
    ),
    keyColumnMinWidth: CssLengthSchema.optional().describe('Minimum width of the key column (columns layout).'),
    keyColumnMaxWidth: CssLengthSchema.optional().describe('Maximum width of the key column (columns layout).'),
    width: CssLengthSchema.optional().describe('Fixed width of the list box. Defaults to 100% of the region.'),
    minWidth: CssLengthSchema.optional().describe('Minimum width of the list box.'),
    maxWidth: CssLengthSchema.optional().describe('Maximum width of the list box.'),
  })
  .default({})
  .describe('Granular sizing / layout / width controls. Presets set bundles; explicit lengths override.')

/** Presentation config for `keyValue`. Derived from {@link keyValueStyleSchema}. */
export type KeyValueStyle = z.infer<typeof keyValueStyleSchema>

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
  listStyle: keyValueStyleSchema.describe(
    'Granular presentation: font sizes, gaps, layout (columns/stacked), placement, and box/column widths.',
  ),
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
    {
      kind: 'select',
      key: 'listStyle.layout',
      label: 'Layout',
      options: [
        { value: 'columns', label: 'Columns' },
        { value: 'stacked', label: 'Stacked' },
      ],
    },
    {
      kind: 'select',
      key: 'listStyle.size',
      label: 'Text size',
      options: [
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Large' },
      ],
    },
    {
      kind: 'select',
      key: 'listStyle.gap',
      label: 'Row gap',
      options: [
        { value: 'tight', label: 'Tight' },
        { value: 'normal', label: 'Normal' },
        { value: 'loose', label: 'Loose' },
      ],
    },
    {
      kind: 'select',
      key: 'listStyle.justify',
      label: 'Vertical placement',
      options: [
        { value: 'top', label: 'Top' },
        { value: 'center', label: 'Centre' },
        { value: 'bottom', label: 'Bottom' },
      ],
    },
    { kind: 'text', key: 'listStyle.titleFontSize', label: 'Title font size (override)' },
    { kind: 'text', key: 'listStyle.keyFontSize', label: 'Key font size (override)' },
    { kind: 'text', key: 'listStyle.valueFontSize', label: 'Value font size (override)' },
    { kind: 'text', key: 'listStyle.rowGap', label: 'Row gap (override)' },
    { kind: 'text', key: 'listStyle.columnGap', label: 'Column gap' },
    { kind: 'text', key: 'listStyle.titleGap', label: 'Gap below title' },
    { kind: 'text', key: 'listStyle.keyColumnWidth', label: 'Key column width' },
    { kind: 'text', key: 'listStyle.keyColumnMinWidth', label: 'Key column min width' },
    { kind: 'text', key: 'listStyle.keyColumnMaxWidth', label: 'Key column max width' },
    { kind: 'text', key: 'listStyle.width', label: 'Box width' },
    { kind: 'text', key: 'listStyle.minWidth', label: 'Box min width' },
    { kind: 'text', key: 'listStyle.maxWidth', label: 'Box max width' },
  ],
}

export default keyValueModule
