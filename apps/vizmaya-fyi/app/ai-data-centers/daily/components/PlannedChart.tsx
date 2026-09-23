import type { EditionChart } from '@vismay/content-source/dcEditionTypes'
import SourceChip from './SourceChip'
import { themeChartSvg } from './chartSvg'

/**
 * A chart the composer planned for this section: the SVG it rendered at
 * compose time (themed here to the page's CSS variables), the one-sentence
 * reading under it, and the stories every row was quoted from. The eyebrow
 * (the chart's title) is the caller's, since each chapter frames its cards
 * differently.
 */
export default function PlannedChart({ chart, sources = true }: { chart: EditionChart; sources?: boolean }) {
  if (!chart.svg) return null
  return (
    <figure className="pchart" data-chart-type={chart.spec.chartType}>
      <div
        className="pchart-svg"
        style={{ aspectRatio: chart.width && chart.height ? `${chart.width} / ${chart.height}` : undefined }}
        role="img"
        aria-label={`${chart.title}. ${chart.caption}`}
        dangerouslySetInnerHTML={{ __html: themeChartSvg(chart.svg) }}
      />
      <figcaption className="pchart-cap">
        {chart.caption}
        {sources && chart.sources.map((s) => <SourceChip key={s.url} source={s} />)}
      </figcaption>
    </figure>
  )
}
