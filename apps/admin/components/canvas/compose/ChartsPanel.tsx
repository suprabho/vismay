'use client'

import { ChartCard, type ChartRequirementView } from './ChartCard'
import { SectionHeading, btnGhostCls } from './ui'

/**
 * Charts panel (shown under the Outline stage): the outline plans chart
 * REQUIREMENTS; this generates the actual data, grounded in the sources.
 * Each card can re-plan its own requirement (prompt); per-chart DATA regenerate
 * also lives on the canvas chart node.
 */
export function ChartsPanel({
  charts,
  results,
  errors,
  busy,
  wide,
  onGenerate,
  onRetry,
  onRegeneratePrompt,
}: {
  charts: ChartRequirementView[]
  results: Record<string, boolean>
  /** Failure reason for the charts that came back ✗ (id → message). */
  errors?: Record<string, string>
  busy: string | null
  wide?: boolean
  onGenerate: () => void
  /** Retry a single failed chart's DATA (regenerates just that chart). */
  onRetry?: (id: string) => Promise<boolean>
  /** Re-plan a single chart's requirement (prompt), optionally with a note. */
  onRegeneratePrompt?: (id: string, feedback?: string) => Promise<boolean>
}) {
  return (
    <section className="space-y-3 border-t border-white/10 pt-4">
      <SectionHeading title="Charts" count={charts.length} hint="tap a chart for its full requirement" />
      <ul
        className={
          wide
            ? 'grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] items-start gap-1.5'
            : 'space-y-1.5'
        }
      >
        {charts.map((c) => (
          <ChartCard
            key={c.id}
            chart={c}
            result={results[c.id]}
            error={errors?.[c.id]}
            busy={busy}
            onRetry={onRetry}
            onRegenerate={onRegeneratePrompt}
          />
        ))}
      </ul>
      <button
        onClick={onGenerate}
        disabled={!!busy}
        className={`${wide ? 'px-4' : 'w-full'} ${btnGhostCls} py-2`}
      >
        {busy === 'charts'
          ? `Generating charts… (${charts.length})`
          : `Generate ${charts.length} chart${charts.length > 1 ? 's' : ''} → data`}
      </button>
    </section>
  )
}
