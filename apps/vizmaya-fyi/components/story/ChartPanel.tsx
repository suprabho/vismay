'use client'

import KoreaBarChart from './charts/KoreaBarChart'
import HeliumPriceChart from './charts/HeliumPriceChart'
import FeedbackLoopDiagram from './charts/FeedbackLoopDiagram'
import DRAMPriceChart from './charts/DRAMPriceChart'
import StockCandlestickChart from './charts/StockCandlestickChart'
import PolarExposureChart from './charts/PolarExposureChart'
import HBMDRAMTreemap from './charts/HBMDRAMTreemap'
import LNGCarrierTreemap from './charts/LNGCarrierTreemap'
import QatarPlantMap from './charts/QatarPlantMap'
import DDR5AreaChart from './charts/DDR5AreaChart'
import GenericChart from './charts/GenericChart'

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
