import type { ReactNode } from 'react'

export interface AdminTableColumn<T> {
  key: string
  label: ReactNode
  render: (row: T) => ReactNode
  /** Secondary columns disappear on narrow screens. */
  responsive?: 'primary' | 'secondary'
  className?: string
  headerClassName?: string
  /** Keep the action column visible while a dense table scrolls. */
  sticky?: boolean
}

interface AdminTableProps<T> {
  rows: T[]
  columns: AdminTableColumn<T>[]
  rowKey: (row: T) => string
  empty: ReactNode
  caption?: string
  getRowClassName?: (row: T) => string
  minWidth?: 'default' | 'none'
}

/**
 * The shared collection surface for admin records. It deliberately stays
 * close to native table semantics: callers own cell content and behavior,
 * while this component owns the consistent chrome and responsive treatment.
 */
export function AdminTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  caption,
  getRowClassName,
  minWidth = 'default',
}: AdminTableProps<T>) {
  return (
    <div data-admin-table className="min-w-0 overflow-x-auto">
      <table className={`w-full border-collapse text-sm ${minWidth === 'default' ? 'min-w-[640px]' : ''}`}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cellClasses(column, true)}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={`group transition-colors hover:bg-white/[0.025] ${getRowClassName?.(row) ?? ''}`}
            >
              {columns.map((column) => (
                <td key={column.key} className={cellClasses(column, false)}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <div className="px-4 py-12 text-center text-sm text-neutral-500">{empty}</div> : null}
    </div>
  )
}

function cellClasses<T>(column: AdminTableColumn<T>, header: boolean): string {
  const responsive = column.responsive === 'secondary' ? 'hidden md:table-cell' : ''
  const sticky = column.sticky ? 'sticky right-0 bg-neutral-950 group-hover:bg-[#101010]' : ''
  const base = header ? 'px-4 py-2.5 font-medium' : 'px-4 py-3 align-middle'
  return [base, responsive, sticky, column.className, header ? column.headerClassName : '']
    .filter(Boolean)
    .join(' ')
}
