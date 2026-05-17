/**
 * F1 vertical — bundle of viz types for Formula 1 storytelling.
 *
 * Engine boot calls this `register()` once when a story's frontmatter
 * declares `vertical: 'f1'`. Each concrete module is dynamic-imported and
 * handed to `registerVizModule` so vizmaya.fyi (and any app that doesn't
 * use F1) tree-shakes it out of the bundle.
 *
 * Scaffold ships three modules — race-row, driver-standings, position-chart —
 * proving the plugin boundary works end-to-end. Additional modules
 * (race-card, constructor-standings, qualifying-results, fp-results,
 * sprint-results, news-card) are TODOs greppable as `TODO(vizf1-scaffold)`.
 */

import { registerVizModule } from '@vismay/viz-engine'

export async function register(): Promise<void> {
  const [
    { default: raceRowModule },
    { default: driverStandingsModule },
    { default: positionChartModule },
  ] = await Promise.all([
    import('./modules/race-row'),
    import('./modules/driver-standings'),
    import('./modules/position-chart'),
  ])
  registerVizModule(raceRowModule)
  registerVizModule(driverStandingsModule)
  registerVizModule(positionChartModule)
  // TODO(vizf1-scaffold): register race-card, constructor-standings,
  // qualifying-results, fp-results, sprint-results, news-card.
}
