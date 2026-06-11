'use client'

import { ChartCard, type ChartRequirementView } from './ChartCard'
import { SectionHeading, btnGhostCls } from './ui'

/**
 * Charts panel (shown under the Outline stage): the outline plans chart
 * REQUIREMENTS; this generates the actual data, grounded in the sources.
 * Per-chart regenerate lives on the canvas chart node.
 */
export function ChartsPanel({
  charts,
  results,
  busy,
  wide,
  onGenerate,
}: {
  charts: ChartRequirementView[]
  results: Record<string, boolean>
  busy: string | null
  wide?: boolean
  onGenerate: () => void
}) {
  return (
    <section className="space-y-3 border-t border-white/10 pt-4">
      <SectionHeading title="Charts" count={charts.length} hint="tap a chart for its full requirement" />
      <ul className={wide ? 'grid items-start gap-1.5 md:grid-cols-2' : 'space-y-1.5'}>
        {charts.map((c) => (
          <ChartCard key={c.id} chart={c} result={results[c.id]} />
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
