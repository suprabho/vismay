import { createChartDataHandler } from '@vismay/content-source/handlers/chartData'

// GenericChart (@vismay/viz-engine) fetches its ECharts JSON from
// `/api/chart-data/<slug>/<id>` at runtime. The public site (vizmaya-fyi)
// serves this, but the admin share-card composer renders the same charts via
// ForegroundLayoutSlot → GenericChart (one per chart graphic), so admin needs
// the identical endpoint or every chart preview 404s. Same shared handler, same
// content source admin already uses for the chart editor.
export const { GET } = createChartDataHandler()
