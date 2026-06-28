'use client'

import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import GenericChart from './echarts/GenericChart'
import { CHART_REGISTRY } from './registry'
import type { ChartRenderProps } from './_shared/types'

// Lazy so Observable Plot only enters the bundle of a story that renders a
// `plot:` chart — keeps it out of every story that uses ECharts only.
const GenericPlot = lazy(() => import('./d3/GenericPlot'))

/**
 * Foreground chart dispatcher. Resolves a string id to its chart component.
 * The persistent map background is NOT here — it lives at page level.
 *
 * Resolution order:
 *   1. `data:<id>` → {@link GenericChart} (ECharts JSON loaded at runtime from
 *      `/api/chart-data/<slug>/<id>`). This is the path used by stories
 *      generated via `npm run ingest`.
 *   2. `plot:<id>` → {@link GenericPlot} (Observable Plot JSON from the same
 *      endpoint). The D3-family parallel to `data:`.
 *   3. a key in {@link CHART_REGISTRY} → the registered chart, lazily imported
 *      so its engine bundle (ECharts, D3, …) splits cleanly per chart.
 *
 * Each registry chart is wrapped in <Suspense> while its chunk loads.
 * Readiness for headless capture is signalled by the chart module wrapper
 * (`modules/chart/Component.tsx`), not here — see `_shared/types.ts`.
 */

// React.lazy must be called once per component, not per render — cache by id.
const lazyCache = new Map<string, LazyExoticComponent<ComponentType<ChartRenderProps>>>()

function getLazyChart(entry: { id: string; load: () => Promise<{ default: ComponentType<ChartRenderProps> }> }) {
  let cached = lazyCache.get(entry.id)
  if (!cached) {
    cached = lazy(entry.load)
    lazyCache.set(entry.id, cached)
  }
  return cached
}

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

  if (chartId?.startsWith('plot:')) {
    if (!slug) return null
    const id = chartId.slice('plot:'.length)
    return (
      <Suspense fallback={null}>
        <GenericPlot slug={slug} id={id} activeStep={activeStep} />
      </Suspense>
    )
  }

  const entry = chartId ? CHART_REGISTRY[chartId] : undefined
  if (!entry) return null

  const LazyChart = getLazyChart(entry)
  return (
    <Suspense fallback={null}>
      <LazyChart slug={slug} activeStep={activeStep} />
    </Suspense>
  )
}
