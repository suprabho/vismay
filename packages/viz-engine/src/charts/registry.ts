import type { RegisteredChart } from './_shared/types'

/**
 * The foreground chart registry. Maps a string id (used in YAML config or
 * ScrollySection blocks) to a lazily-imported chart component.
 *
 * Each entry's `load` is a dynamic `import()`, so a chart — and the engine it
 * pulls in — only enters the bundle of a story that actually uses it. This is
 * what lets ECharts and D3 live side by side without every story paying for
 * both. The per-folder ESLint guardrails (see eslint.config.mjs) keep each
 * engine's imports from leaking into the other.
 *
 * Two id-prefix conventions are handled by `ChartPanel` directly rather than
 * this map:
 *   - `data:<id>` → ECharts JSON via `echarts/GenericChart`
 * (a parallel `plot:<id>` → Observable Plot path is planned; see
 *  docs/d3-echarts-parallel-plan.md §3.3.)
 */
export const CHART_REGISTRY: Record<string, RegisteredChart> = {
  // ── ECharts ───────────────────────────────────────────────────────────────
  'stock-candlestick': { id: 'stock-candlestick', engine: 'echarts', renderer: 'canvas', load: () => import('./echarts/StockCandlestickChart') },
  'polar-exposure':    { id: 'polar-exposure',    engine: 'echarts', renderer: 'svg',    load: () => import('./echarts/PolarExposureChart') },
  'hbm-treemap':       { id: 'hbm-treemap',       engine: 'echarts', renderer: 'canvas', load: () => import('./echarts/HBMDRAMTreemap') },
  'lng-treemap':       { id: 'lng-treemap',       engine: 'echarts', renderer: 'canvas', load: () => import('./echarts/LNGCarrierTreemap') },
  'ddr5-area':         { id: 'ddr5-area',         engine: 'echarts', renderer: 'canvas', load: () => import('./echarts/DDR5AreaChart') },
  'korea-bar':         { id: 'korea-bar',         engine: 'echarts', renderer: 'canvas', load: () => import('./echarts/KoreaBarChart') },
  'helium-price':      { id: 'helium-price',      engine: 'echarts', renderer: 'canvas', load: () => import('./echarts/HeliumPriceChart') },
  'dram-price':        { id: 'dram-price',        engine: 'echarts', renderer: 'canvas', load: () => import('./echarts/DRAMPriceChart') },

  // ── Bespoke hand-built SVG (no charting library) ───────────────────────────
  'qatar-map':         { id: 'qatar-map',         engine: 'svg',     renderer: 'svg',    load: () => import('./QatarPlantMap') },
  'feedback-loop':     { id: 'feedback-loop',     engine: 'svg',     renderer: 'svg',    load: () => import('./FeedbackLoopDiagram') },

  // ── D3 ─────────────────────────────────────────────────────────────────────
  'beeswarm-example':  { id: 'beeswarm-example',  engine: 'd3',      renderer: 'svg',    load: () => import('./d3/BeeswarmChart') },
}
