import type { ChartLayerConfig } from './index'

/**
 * Catalog-only sample fixture. NOT imported by production consumers — they
 * tree-shake this out. See `apps/catalog/` for the only consumer.
 *
 * NOTE: rendering this requires a chart-data JSON at
 * `/api/chart-data/<slug>/<id>.json`, which the catalog app doesn't serve.
 * The catalog falls back to a "preview unavailable" chip for chart.
 */
export const sample: ChartLayerConfig = {
  type: 'chart',
  id: 'catalog-demo-bars',
}
