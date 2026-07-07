'use client'

import { useState } from 'react'
import { Caret, Chip, DetailBlock, btnGhostCls, inputCls } from './ui'

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
  error,
  busy,
  onRetry,
  onRegenerate,
}: {
  chart: ChartRequirementView
  /** Outcome of the last batch generate run, if any (id → ok). */
  result?: boolean
  /** Failure reason when the last run came back ✗, shown so the author can
   *  judge whether a retry will help or the plan/sources need changing. */
  error?: string
  /** The flow's single-flight busy key, so a regen-in-flight disables the button. */
  busy?: string | null
  /** Retry THIS chart's DATA — regenerates just this one (not the whole batch). */
  onRetry?: (id: string) => Promise<boolean>
  /** Re-plan THIS chart's requirement (its prompt), optionally with a note. */
  onRegenerate?: (id: string, feedback?: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const regenBusy = busy === `chart:${chart.id}`
  const retryBusy = busy === `chart-retry:${chart.id}`
  const failed = result === false

  async function regenerate() {
    if (!onRegenerate || regenBusy) return
    if (await onRegenerate(chart.id, feedback.trim() || undefined)) setFeedback('')
  }
  async function retry() {
    if (!onRetry || retryBusy) return
    await onRetry(chart.id)
  }
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
        {failed && (
          <Chip tone="red" title={error ?? 'Generation failed'}>
            ✗ failed
          </Chip>
        )}
        {failed && onRetry && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              retry()
            }}
            disabled={!!busy}
            title="Regenerate just this chart's data"
            className={`shrink-0 ${btnGhostCls} px-2 py-1`}
          >
            {retryBusy ? 'Retrying…' : 'Retry'}
          </button>
        )}
        <Caret open={open} />
      </div>
      {open ? (
        <div className="space-y-2.5 border-t border-white/5 px-2.5 py-2">
          {failed && error && (
            <DetailBlock label="Why it failed">
              <span className="text-red-300">{error}</span>
            </DetailBlock>
          )}
          <DetailBlock label="Requirement">{chart.requirement}</DetailBlock>
          {(chart.xLabel || chart.yLabel) && (
            <DetailBlock label="Axes">
              {[chart.xLabel && `x — ${chart.xLabel}`, chart.yLabel && `y — ${chart.yLabel}`]
                .filter(Boolean)
                .join(' · ')}
            </DetailBlock>
          )}
          {onRegenerate && (
            <div className="flex gap-1.5 pt-0.5">
              <input
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') regenerate()
                }}
                disabled={regenBusy}
                placeholder="Re-plan this chart with a note (optional)…"
                className={`min-w-0 flex-1 ${inputCls}`}
              />
              <button
                onClick={regenerate}
                disabled={!!busy}
                title="Re-plan this chart's prompt — sharpen what it plots / change its type"
                className={`shrink-0 ${btnGhostCls}`}
              >
                {regenBusy ? 'Re-planning…' : 'Regenerate prompt'}
              </button>
            </div>
          )}
        </div>
      ) : failed && error ? (
        <p className="line-clamp-2 px-2.5 pb-2 text-[11px] leading-relaxed text-red-300/80">
          {error}
        </p>
      ) : (
        <p className="line-clamp-2 px-2.5 pb-2 text-[11px] leading-relaxed text-neutral-500">
          {chart.requirement}
        </p>
      )}
    </li>
  )
}
