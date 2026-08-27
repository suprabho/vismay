import type { TelemetryChartConfig } from './index'

/**
 * Catalog/SSG sample — a 2-driver lap-time-by-lap comparison. All series data is
 * inline so the preview renders live (no chart-data fetch).
 */
const laps = Array.from({ length: 12 }, (_, i) => {
  const lap = i + 1
  // Tyre deg pushes both up over the stint; VER a touch quicker.
  const ver = 92.4 + i * 0.18 + (i === 6 ? 1.4 : 0)
  const lec = 92.7 + i * 0.2 + (i === 5 ? 1.1 : 0)
  return { lap, ver: Number(ver.toFixed(2)), lec: Number(lec.toFixed(2)) }
})

export const sample: TelemetryChartConfig = {
  type: 'f1:telemetry-chart',
  caption: 'Lap-time trend — Verstappen vs Leclerc (medium stint)',
  spec: {
    id: 'sample-laptime',
    type: 'multi_line',
    title: 'Lap time by lap',
    xAxis: { key: 'lap', label: 'Lap', unit: '' },
    yAxis: { key: 'sec', label: 'Lap time (s)', unit: 's' },
    series: [
      { id: 'ver', label: 'VER', driverNumber: 1, color: '#3671C6', dataKey: 'ver', type: 'actual' },
      { id: 'lec', label: 'LEC', driverNumber: 16, color: '#E8002D', dataKey: 'lec', type: 'actual' },
    ],
    dataPoints: laps,
    annotations: [{ type: 'line', xValue: 7, color: '#facc15', label: 'VER pit' }],
  },
}
