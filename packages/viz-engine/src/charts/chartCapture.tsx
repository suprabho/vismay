'use client'

import { createContext, useContext } from 'react'

/**
 * Capture-mode coordination for foreground ECharts charts.
 *
 * During headless capture (PDF report/slides, share cards) `page.pdf()` /
 * screenshot fires as soon as `window.__pdfReady__` flips. A chart that is
 * still playing its entrance animation at that instant snapshots with its
 * data series (bars/lines/areas) tweened up from zero — leaving only the
 * static axes and caption. That is the "graphs missing in PDF" bug.
 *
 * `StoryEChart` reads this context to:
 *   - turn animation off in capture mode (paint the final frame immediately), and
 *   - signal real readiness via the ECharts `finished` event instead of a
 *     blind next-frame guess.
 *
 * The chart module (`modules/chart/Component.tsx`) provides the context. Its
 * defaults are no-ops, so charts rendered outside the capture flow keep their
 * authored animation and behave exactly as before.
 */
export interface ChartCaptureValue {
  /** True while rendering for headless capture (`mode` of 'print' | 'capture'). */
  capture: boolean
  /**
   * Called once on mount by an ECharts chart to take over the chart layer's
   * readiness slot from the module's default next-frame signal, so capture
   * waits for `onPainted` instead of firing a frame after mount.
   */
  onClaim: () => void
  /** Called once the chart's first paint completes (ECharts `finished`). */
  onPainted: () => void
}

const noop = () => {}

const ChartCaptureContext = createContext<ChartCaptureValue>({
  capture: false,
  onClaim: noop,
  onPainted: noop,
})

export const ChartCaptureProvider = ChartCaptureContext.Provider

export function useChartCapture(): ChartCaptureValue {
  return useContext(ChartCaptureContext)
}
