/**
 * F1 vertical — bundle of viz types for Formula 1 storytelling.
 *
 * Engine boot calls this `register()` once when a story's frontmatter
 * declares `vertical: 'f1'`. Each concrete module is dynamic-imported and
 * handed to `registerVizModule` so vizmaya.fyi (and any app that doesn't
 * use F1) tree-shakes it out of the bundle.
 *
 * Modules: race-row, driver-standings, position-chart, race-card, race-replay,
 * constructor-standings, qualifying-results, plus the telemetry suite ported
 * from the f1_backend donor — telemetry-clip (2D clip player), track-3d (R3F 3D
 * track), and telemetry-chart (ECharts). Each is dynamic-imported so apps that
 * don't use a given module tree-shake it out.
 *
 * TODO(vizf1-scaffold): fp-results, sprint-results, news-card remain.
 */

import { registerVizModule } from '@vismay/viz-engine'

export async function register(): Promise<void> {
  const [
    { default: raceRowModule },
    { default: driverStandingsModule },
    { default: positionChartModule },
    { default: raceCardModule },
    { default: raceReplayModule },
    { default: constructorStandingsModule },
    { default: qualifyingResultsModule },
    { default: telemetryClipModule },
    { default: track3dModule },
    { default: telemetryChartModule },
  ] = await Promise.all([
    import('./modules/race-row'),
    import('./modules/driver-standings'),
    import('./modules/position-chart'),
    import('./modules/race-card'),
    import('./modules/race-replay'),
    import('./modules/constructor-standings'),
    import('./modules/qualifying-results'),
    import('./modules/telemetry-clip'),
    import('./modules/track-3d'),
    import('./modules/telemetry-chart'),
  ])
  registerVizModule(raceRowModule)
  registerVizModule(driverStandingsModule)
  registerVizModule(positionChartModule)
  registerVizModule(raceCardModule)
  registerVizModule(raceReplayModule)
  registerVizModule(constructorStandingsModule)
  registerVizModule(qualifyingResultsModule)
  registerVizModule(telemetryClipModule)
  registerVizModule(track3dModule)
  registerVizModule(telemetryChartModule)
}
