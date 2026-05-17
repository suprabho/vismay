'use client'

import KoreaBarChart from './KoreaBarChart'
import HeliumPriceChart from './HeliumPriceChart'
import FeedbackLoopDiagram from './FeedbackLoopDiagram'
import DRAMPriceChart from './DRAMPriceChart'
import StockCandlestickChart from './StockCandlestickChart'
import PolarExposureChart from './PolarExposureChart'
import HBMDRAMTreemap from './HBMDRAMTreemap'
import LNGCarrierTreemap from './LNGCarrierTreemap'
import QatarPlantMap from './QatarPlantMap'
import DDR5AreaChart from './DDR5AreaChart'
import GenericChart from './GenericChart'

/**
 * Foreground chart registry. Maps a string id (used in YAML config or
 * ScrollySection blocks) to its chart component. The persistent map
 * background is NOT in this registry — it lives at page level.
 *
 * An id prefixed with `data:` is resolved by GenericChart, which loads
 * `content/stories/<slug>/charts/<id>.json` and renders its ECharts option.
 * This is the path used by stories generated via `npm run ingest`.
 */
export default function ChartPanel({
  chartId,
  activeStep = 0,
  slug,
}: {
  chartId?: string
  activeStep?: number
  slug?: string
}) {
  if (chartId?.startsWith('data:')) {
    if (!slug) return null
    const id = chartId.slice('data:'.length)
    return <GenericChart slug={slug} id={id} activeStep={activeStep} />
  }
  switch (chartId) {
    case 'stock-candlestick':
      return <StockCandlestickChart activeStep={activeStep} />
    case 'polar-exposure':
      return <PolarExposureChart activeStep={activeStep} />
    case 'hbm-treemap':
      return <HBMDRAMTreemap activeStep={activeStep} />
    case 'lng-treemap':
      return <LNGCarrierTreemap activeStep={activeStep} />
    case 'qatar-map':
      return <QatarPlantMap activeStep={activeStep} />
    case 'ddr5-area':
      return <DDR5AreaChart activeStep={activeStep} />
    case 'korea-bar':
      return <KoreaBarChart activeStep={activeStep} />
    case 'helium-price':
      return <HeliumPriceChart activeStep={activeStep} />
    case 'feedback-loop':
      return <FeedbackLoopDiagram activeStep={activeStep} />
    case 'dram-price':
      return <DRAMPriceChart activeStep={activeStep} />
    default:
      return null
  }
}
