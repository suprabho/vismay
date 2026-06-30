'use client'

import { useState } from 'react'
import { Caret, Chip, DetailBlock } from './ui'

/** A chart requirement as the outline persisted it (see `chartRequirementSchema`). */
export interface ChartRequirementView {
  id: string
  title?: string
  /** A flint chart-template name, e.g. "Bar Chart", "Scatter Plot" (see CHART_TYPES). */
  chartType: string
  requirement: string
  xLabel?: string
  yLabel?: string
}

/**
 * One planned chart: title + chart-type chip, per-chart generated/failed status
 * after a batch run, and a click-to-expand full requirement (collapsed it
 * clamps to two lines).
 */
export function ChartCard({
  chart,
  result,
}: {
  chart: ChartRequirementView
  /** Outcome of the last batch generate run, if any (id → ok). */
  result?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-lg border border-white/10 bg-neutral-900/60">
      <div
        className="flex cursor-pointer items-center gap-1.5 px-2.5 py-2"
        onClick={() => setOpen((o) => !o)}
        title={open ? 'Hide requirement' : 'Show full requirement'}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-100">
          {chart.title ?? chart.id}
        </span>
        <Chip tone="sky" title="Chart type">
          {chart.chartType}
        </Chip>
        {result === true && (
          <Chip tone="emerald" title="Chart data generated">
            ✓ data
          </Chip>
        )}
        {result === false && (
          <Chip tone="red" title="Generation failed — rerun, or regenerate from the canvas chart node">
            ✗ failed
          </Chip>
        )}
        <Caret open={open} />
      </div>
      {open ? (
        <div className="space-y-2.5 border-t border-white/5 px-2.5 py-2">
          <DetailBlock label="Requirement">{chart.requirement}</DetailBlock>
          {(chart.xLabel || chart.yLabel) && (
            <DetailBlock label="Axes">
              {[chart.xLabel && `x — ${chart.xLabel}`, chart.yLabel && `y — ${chart.yLabel}`]
                .filter(Boolean)
                .join(' · ')}
            </DetailBlock>
          )}
        </div>
      ) : (
        <p className="line-clamp-2 px-2.5 pb-2 text-[11px] leading-relaxed text-neutral-500">
          {chart.requirement}
        </p>
      )}
    </li>
  )
}
