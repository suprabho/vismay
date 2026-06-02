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
 * Resolution order:
 *   1. `data:<id>` — legacy explicit form. Resolved by GenericChart, which
 *      fetches `/api/chart-data/<slug>/<id>` (Supabase-backed; previously
 *      `content/stories/<slug>/charts/<id>.json` on disk).
 *   2. One of the bespoke hardcoded components below (KoreaBarChart, etc.).
 *   3. Bare id with a known slug — also resolved by GenericChart. This is
 *      the default for the new layered schema (`foreground: [{ type:
 *      'chart', id: 'segment-revenue' }]`), where authors don't write the
 *      `data:` prefix. A missing row renders GenericChart's "Chart load
 *      failed" message instead of silently returning null.
 *
 * Bare id with no slug still returns null — the legacy ScrollySection
 * callsite mounts ChartPanel without a slug and expects the hardcoded
 * registry only.
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
  if (!chartId) return null
  if (chartId.startsWith('data:')) {
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
  }
  if (slug) return <GenericChart slug={slug} id={chartId} activeStep={activeStep} />
  return null
}
