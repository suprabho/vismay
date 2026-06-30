import type { ChartColors } from '../../../lib/chartTheme'

/**
 * Themed ECharts tooltip config used by every ECharts chart. Returns
 * `{ show: false }` on mobile (no hover surface there) and a styled axis
 * tooltip on desktop. Pass `extra` to override trigger, formatter,
 * axisPointer, etc.
 *
 * This is ECharts-shaped (the returned object is spread straight into an
 * `EChartsOption.tooltip`), so it lives under `charts/echarts/` rather than
 * in the engine-agnostic `lib/chartTheme.ts`. The D3 family mirrors this
 * surface visually with its own React tooltip in `charts/d3/_kit/`.
 */
export function chartTooltip(
  colors: ChartColors,
  mobile: boolean,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  if (mobile) return { show: false }
  return {
    show: true,
    trigger: 'axis',
    confine: true,
    backgroundColor: colors.chromeBg,
    borderColor: colors.line,
    borderWidth: 1,
    textStyle: { color: colors.chromeText, fontFamily: 'var(--font-mono)', fontSize: 11 },
    axisPointer: { lineStyle: { color: colors.line } },
    ...extra,
  }
}
