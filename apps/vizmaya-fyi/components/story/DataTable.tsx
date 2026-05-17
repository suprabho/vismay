'use client'

import { useRef, useMemo } from 'react'
import { useInView } from '@/lib/use-in-view'
import { DataTableBlock } from '@/types/story'
import dynamic from 'next/dynamic'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

function isNumericColumn(rows: string[][], colIndex: number): boolean {
  return rows.every((row) => {
    const val = row[colIndex]?.replace(/[%$+,]/g, '').trim()
    return !isNaN(parseFloat(val))
  })
}

function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '')
}

export default function DataTable({ block }: { block: DataTableBlock }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { threshold: 0.2 })

  const hasNumeric = useMemo(
    () => block.headers.length >= 2 && isNumericColumn(block.rows, 1),
    [block]
  )

  if (hasNumeric) {
    return (
      <div
        ref={ref}
        className="max-w-[860px] mx-auto px-8 py-4 transition-opacity duration-700"
        style={{ opacity: isInView ? 1 : 0 }}
      >
        <ReactECharts
          option={{
            backgroundColor: 'transparent',
            grid: { left: 150, right: 30, top: 10, bottom: 30 },
            xAxis: {
              type: 'value',
              axisLabel: {
                color: 'var(--color-muted, #5a6a70)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
              },
              splitLine: { lineStyle: { color: 'var(--color-line)' } },
              axisLine: { show: false },
            },
            yAxis: {
              type: 'category',
              data: block.rows.map((r) => stripMarkdown(r[0])).reverse(),
              axisLabel: {
                color: 'var(--color-text, #e0ddd5)',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
              },
              axisLine: { show: false },
              axisTick: { show: false },
            },
            series: [
              {
                type: 'bar',
                data: block.rows
                  .map((r) => {
                    const val = r[1].replace(/[%$+,]/g, '').trim()
                    return parseFloat(val) || 0
                  })
                  .reverse(),
                itemStyle: {
                  color: 'var(--color-accent, #D85A30)',
                  borderRadius: [0, 3, 3, 0],
                },
                barWidth: '60%',
                label: {
                  show: true,
                  position: 'right',
                  color: 'var(--color-muted, #5a6a70)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  formatter: (params: { dataIndex: number }) => {
                    const idx = block.rows.length - 1 - params.dataIndex
                    return stripMarkdown(block.rows[idx][1])
                  },
                },
              },
            ],
            tooltip: { show: false },
          }}
          style={{ height: Math.max(200, block.rows.length * 50) }}
          opts={{ renderer: 'svg' }}
        />
      </div>
    )
  }

  // Fallback: render as styled table
  return (
    <div ref={ref} className="max-w-[860px] mx-auto px-8 py-4">
      <div
        className="transition-opacity duration-700"
        style={{ opacity: isInView ? 1 : 0 }}
      >
        {block.rows.map((row, i) => (
          <div
            key={i}
            className="grid gap-4 py-4 items-center"
            style={{
              gridTemplateColumns: '140px 1fr 100px',
              borderBottom: '0.5px solid var(--color-line, #1a2830)',
            }}
          >
            <div
              className="font-[family-name:var(--font-sans)] text-[0.9rem]"
              style={{ color: 'var(--color-text)' }}
            >
              {stripMarkdown(row[0])}
            </div>
            <div
              className="h-1.5 rounded-full"
              style={{ background: 'var(--color-line, #1a2830)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  background: 'var(--color-teal)',
                  width: isInView ? '40%' : '0%',
                }}
              />
            </div>
            <div
              className="font-[family-name:var(--font-mono)] text-[0.85rem] text-right font-bold"
              style={{ color: 'var(--color-teal)' }}
            >
              {stripMarkdown(row[1])}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
