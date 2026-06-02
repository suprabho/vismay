'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '../../types'
import type { TableCellAlign, TableLayerConfig } from './index'

function formatCell(raw: unknown, col: TableLayerConfig['columns'][number]): string {
  if (raw == null) return ''
  const fmt = col.format ?? 'text'
  if (fmt === 'text') return String(raw)
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return String(raw)
  const decimals = col.decimals ?? 0
  if (fmt === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: col.currency ?? 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n)
  }
  if (fmt === 'percent') {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n)
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

function resolveAlign(col: TableLayerConfig['columns'][number]): TableCellAlign {
  if (col.align) return col.align
  const isNumeric = col.format === 'number' || col.format === 'currency' || col.format === 'percent'
  return isNumeric ? 'right' : 'left'
}

export default function TableLayerComponent({
  config,
  noteReady,
  mode,
}: VizRenderProps<TableLayerConfig>) {
  useEffect(() => {
    noteReady()
  }, [noteReady])

  // In print mode, force black-on-white for legibility.
  const printMode = mode === 'print'
  const textColor = printMode ? '#111' : 'var(--color-text)'
  const mutedColor = printMode ? '#555' : 'var(--color-muted)'
  const borderColor = printMode ? '#ddd' : 'rgba(255,255,255,0.10)'

  return (
    <figure
      className="w-full h-full flex flex-col"
      style={{ margin: 0, gap: '0.5rem', justifyContent: 'center' }}
    >
      <div style={{ overflow: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'var(--font-sans, system-ui)',
            fontSize: '0.85rem',
            color: textColor,
          }}
        >
          <thead>
            <tr>
              {config.columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: resolveAlign(col),
                    padding: '0.5rem 0.75rem',
                    borderBottom: `1px solid ${borderColor}`,
                    color: mutedColor,
                    fontWeight: 600,
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  {col.label ?? col.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {config.rows.map((row, ri) => (
              <tr key={ri}>
                {config.columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      textAlign: resolveAlign(col),
                      padding: '0.5rem 0.75rem',
                      borderBottom: `1px solid ${borderColor}`,
                      fontVariantNumeric: col.format === 'text' ? undefined : 'tabular-nums',
                    }}
                  >
                    {formatCell(row[col.key], col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {config.caption && (
        <figcaption
          className="font-mono text-center"
          style={{
            color: mutedColor,
            fontSize: '0.7rem',
            letterSpacing: '0.05em',
          }}
        >
          {config.caption}
        </figcaption>
      )}
    </figure>
  )
}
