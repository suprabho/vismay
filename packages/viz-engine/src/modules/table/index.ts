import { z } from 'zod'
import type { VizModule } from '../../types'
import { AlignSchema, parseWithSchema } from '../../lib/zodConfig'

const TableCellFormatSchema = z.enum(['text', 'number', 'currency', 'percent'])
export type TableCellFormat = z.infer<typeof TableCellFormatSchema>
export type TableCellAlign = z.infer<typeof AlignSchema>

const TableColumnSchema = z.object({
  key: z.string().trim().min(1).describe('Object key read from each row. Required.'),
  label: z.string().optional().describe('Header label. Defaults to the key.'),
  align: AlignSchema.optional().describe('Cell alignment. Defaults left for text, right for numerics.'),
  format: TableCellFormatSchema.default('text').describe('Cell value formatting. Defaults to text.'),
  decimals: z.number().optional().describe('Decimal places for number / percent / currency.'),
  currency: z.string().optional().describe("Currency code for format: currency (e.g. 'USD')."),
})
export type TableColumn = z.infer<typeof TableColumnSchema>

/**
 * Zod schema for the `table` module — the deck-format data table.
 *
 * Rows are an array of objects whose properties match `columns[].key`. The
 * per-column `format` drives number / currency / percent rendering, so authors
 * write raw numbers in YAML rather than pre-formatted strings.
 */
export const tableSchema = z.object({
  type: z.literal('table'),
  columns: z
    .array(TableColumnSchema)
    .min(1)
    .describe('Non-empty list of column definitions: [{ key, label?, align?, format?, decimals?, currency? }].'),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .describe('Array of row objects, each keyed by the columns’ `key` values.'),
  caption: z.string().optional().describe('Optional caption rendered below the table.'),
})

export type TableLayerConfig = z.infer<typeof tableSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): TableLayerConfig {
  return parseWithSchema(tableSchema, raw, ctx)
}

const tableModule: VizModule<TableLayerConfig> = {
  type: 'table',
  label: 'Table',
  slots: ['foreground'],
  schema: tableSchema,
  parseConfig,
  load: () => import('./Component'),
  // Tables paint synchronously but can have many rows; profile as first-paint
  // so the readiness coordinator gives them a frame.
  readinessProfile: 'first-paint',
  defaultStyle: { pointerEvents: 'none' },
  adminForm: () => [
    { kind: 'json', key: 'columns', label: 'Columns ([{key,label,align,format,decimals,currency}])', required: true },
    { kind: 'json', key: 'rows', label: 'Rows (array of objects)', required: true },
    { kind: 'text', key: 'caption', label: 'Caption' },
  ],
  aiFieldExamples: {
    columns:
      'columns:\n' +
      '  - { key: metric, label: Metric }\n' +
      '  - { key: value, label: FY2025, align: right, format: currency, currency: USD, decimals: 1 }',
    rows:
      'rows:\n' +
      '  - { metric: Revenue, value: 18700000000 }\n' +
      '  - { metric: Launches, value: 134 }',
  },
}

export default tableModule
