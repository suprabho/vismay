'use client'

import ChartPanel from '@/components/story/ChartPanel'

interface Props {
  chartId: string
  activeStep: number
  slug: string
  heading?: string
  subheading?: string
}

/**
 * Renders an ECharts chart at a specific activeStep for share mode.
 * Charts use SVG renderer so they capture cleanly with html-to-image.
 *
 * Optional heading/subheading sit above the chart and are configured via
 * the per-chart-card `chart` slot in share overrides — kept separate from
 * the map-title and content cards that share the same section/subsection
 * scope so each card can carry its own copy.
 */
export default function ShareChartCard({ chartId, activeStep, slug, heading, subheading }: Props) {
  const hasText = !!(heading || subheading)
  return (
    <div className="w-full h-full flex flex-col p-[10px] pb-[32px]">
      {hasText && (
        <div className="shrink-0">
          {heading && (
            <h4
              className="font-serif text-[20px] text-center texfont-bold leading-[1.2]"
              style={{ color: 'var(--color-accent)' }}
            >
              {heading}
            </h4>
          )}
          {subheading && (
            <p
              className="text-[17px] text-center leading-[1.4]"
              style={{ color: 'var(--color-muted)' }}
            >
              {subheading}
            </p>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0 overflow-hidden **:min-h-0!">
          <ChartPanel chartId={chartId} activeStep={activeStep} slug={slug} />
        </div>
      </div>
    </div>
  )
}
