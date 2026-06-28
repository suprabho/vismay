import type { ComponentType } from 'react'

/**
 * The renderer-agnostic chart contract.
 *
 * A chart — whether it's drawn by ECharts, by D3, or by hand in plain SVG —
 * is just a React component that takes these props. Theming, mobile, and
 * tooltip styling are NOT part of the contract: a chart pulls those from the
 * shared hooks (`useChartColors`, `useIsMobile`) itself, so adding an engine
 * never changes this shape.
 *
 * Readiness for the headless capture pipeline (PDF/share/video) is owned by
 * the chart *module wrapper* (`modules/chart/Component.tsx`), which calls
 * `useStoryReadiness().noteReady` exactly once per chart instance. Because
 * `noteReady` increments a shared counter (calling it twice for one chart can
 * flip `__pdfReady__` early), individual charts must NOT signal readiness on
 * their own while the wrapper does. `noteReady` is therefore intentionally
 * absent from this contract today; revisit only if a chart needs precise,
 * post-animation readiness AND the wrapper's rAF signal is removed for it.
 */
export interface ChartRenderProps {
  /** Story slug, used by data-driven charts to fetch their JSON. Optional for self-contained charts. */
  slug?: string
  /** Scrolly step index; charts that aren't stepped can ignore it. */
  activeStep: number
}

/**
 * Which rendering family a chart belongs to. Drives the per-folder import
 * guardrails (see eslint.config.mjs) and lets the registry reason about
 * code-splitting and export paths.
 *
 * - `echarts` — Apache ECharts (canvas/SVG via echarts-for-react)
 * - `d3`      — D3 modules / Observable Plot, SVG-first
 * - `svg`     — bespoke hand-built React+SVG, no charting library
 */
export type ChartEngine = 'echarts' | 'd3' | 'svg'

/** How the chart paints, used by the export pipeline's PDF-alpha workaround. */
export type ChartRenderer = 'canvas' | 'svg'

/** A single entry in the chart registry. */
export interface RegisteredChart {
  id: string
  engine: ChartEngine
  /**
   * Canvas-rendered charts need the theme-bg paint workaround for the
   * Chromium landscape-PDF alpha bug; SVG charts don't. See the GenericChart
   * comment and plan §3.7.
   */
  renderer: ChartRenderer
  /**
   * Dynamic import so each chart (and the engine it pulls in) splits into its
   * own chunk. A story that only uses ECharts charts never downloads D3, and
   * vice versa.
   */
  load: () => Promise<{ default: ComponentType<ChartRenderProps> }>
}
