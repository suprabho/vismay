/**
 * F1 vertical — bundle of viz types for Formula 1 storytelling.
 *
 * Engine boot calls this `register()` once when a story's frontmatter
 * declares `vertical: 'f1'`. Each concrete module is dynamic-imported and
 * handed to `registerVizModule` so vizmaya.fyi (and any app that doesn't
 * use F1) tree-shakes it out of the bundle.
 *
 * Real engine integration arrives once @vismay/viz-engine exports
 * registerVizModule (Phase B). For now `register` is a no-op placeholder so
 * verticals/f1-viz can be wired into the workspace and consumed without
 * compile errors.
 */

export async function register(): Promise<void> {
  // TODO(phase-b): once @vismay/viz-engine exports registerVizModule, do:
  //   const [{ default: raceCard }] = await Promise.all([import('./modules/race-card')])
  //   registerVizModule(raceCard)
}
