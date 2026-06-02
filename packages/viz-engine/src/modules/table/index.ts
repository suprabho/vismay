import type { VizModule } from '../../types'

export type TableCellFormat = 'text' | 'number' | 'currency' | 'percent'
export type TableCellAlign = 'left' | 'center' | 'right'

export interface TableColumn {
  /** Object key to read from each row. */
  key: string
  /** Header label. Defaults to `key` if omitted. */
  label?: string
  /** Cell alignment. Default `left` for text, `right` for numerics. */
  align?: TableCellAlign
  /** How to format the cell value. Default `text`. */
  format?: TableCellFormat
  /** Decimal places for number/percent/currency. Default 0. */
  decimals?: number
  /** Currency code (e.g. `USD`) for `format: currency`. Default `USD`. */
  currency?: string
}

/**
 * Layer config for the `table` module — the deck-format data table.
 *
 * Rows are an array of objects whose properties match `columns[].key`.
 * Format strings drive number / currency / percent formatting so authors
 * write raw numbers in YAML rather than pre-formatted strings.
 */
export interface TableLayerConfig {
  type: 'table'
  columns: TableColumn[]
  rows: Record<string, unknown>[]
  /** Optional caption rendered below the table. */
  caption?: string
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): TableLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: table layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.columns) || r.columns.length === 0) {
    throw new Error(`${ctx.label}: table 'columns' must be a non-empty array`)
  }
  if (!Array.isArray(r.rows)) {
    throw new Error(`${ctx.label}: table 'rows' must be an array`)
  }
  const columns: TableColumn[] = r.columns.map((c, i) => {
    if (!c || typeof c !== 'object') {
      throw new Error(`${ctx.label}: table column ${i} must be an object`)
    }
    const col = c as Record<string, unknown>
    if (typeof col.key !== 'string' || col.key.trim().length === 0) {
      throw new Error(`${ctx.label}: table column ${i} 'key' is required`)
    }
    return {
      key: col.key.trim(),
      label: typeof col.label === 'string' ? col.label : undefined,
      align: col.align as TableCellAlign | undefined,
      format: (col.format as TableCellFormat | undefined) ?? 'text',
      decimals: typeof col.decimals === 'number' ? col.decimals : undefined,
      currency: typeof col.currency === 'string' ? col.currency : undefined,
    }
  })
  return {
    type: 'table',
    columns,
    rows: r.rows as Record<string, unknown>[],
    caption: typeof r.caption === 'string' ? r.caption : undefined,
  }
}

const tableModule: VizModule<TableLayerConfig> = {
  type: 'table',
  label: 'Table',
  slots: ['foreground'],
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
}

export default tableModule
